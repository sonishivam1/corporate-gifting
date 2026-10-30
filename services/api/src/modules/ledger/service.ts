import { randomUUID } from "node:crypto";

import { getCollections } from "@gifting/db";
import type { BudgetAccount, Cents, Currency } from "@gifting/domain";
import { type Balance, canCover, computeBalance, adjustmentEntry, holdEntry, redemptionEntries, releaseEntry } from "@gifting/ledger";
import type { ClientSession } from "mongodb";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";

export type TeamBalance = {
  accountId: string;
  currency: Currency;
  availableCents: number;
  heldCents: Cents;
  spentCents: Cents;
};

export type NewHold = { giftId: string; campaignId: string; holdCents: Cents };

export type LedgerService = ReturnType<typeof createLedgerService>;

/**
 * Budget accounts and the append-only ledger (ADR 0007). Balances are always
 * computed from entries by @gifting/ledger, never stored.
 */
export function createLedgerService(deps: AppDeps) {
  const c = () => getCollections(deps.db);

  async function account(teamKey: string, session?: ClientSession): Promise<BudgetAccount> {
    const found = await c().accounts.findOne({ teamKey }, { session });
    if (!found) throw new ApiError(404, "account_not_found", "This team has no budget account yet.");
    return found;
  }

  async function rawBalance(acct: BudgetAccount, session?: ClientSession): Promise<Balance> {
    const entries = await c()
      .ledgerEntries.find(
        { accountId: acct._id },
        { session, projection: { _id: 0, type: 1, amountCents: 1, direction: 1, idempotencyKey: 1 } },
      )
      .toArray();
    return computeBalance(entries, acct.creditLimitCents);
  }

  async function balanceOf(acct: BudgetAccount, session?: ClientSession): Promise<TeamBalance> {
    const b = await rawBalance(acct, session);
    return {
      accountId: acct._id,
      currency: acct.currency,
      availableCents: b.available,
      heldCents: b.openHolds,
      spentCents: b.captured + b.fees - b.refunded,
    };
  }

  return {
    balance: async (teamKey: string, session?: ClientSession) => balanceOf(await account(teamKey, session), session),

    /**
     * Places one hold per gift, inside the caller's transaction. Touching the
     * account first makes two concurrent holds on it conflict, so the second
     * transaction retries and sees the first one's holds before it checks
     * the balance. Short means nothing is written.
     */
    async placeHolds(input: { teamKey: string; holds: readonly NewHold[]; createdBy: string; session: ClientSession }) {
      const now = deps.now();
      const acct = await account(input.teamKey, input.session);
      await c().accounts.updateOne({ _id: acct._id }, { $set: { holdsUpdatedAt: now } }, { session: input.session });

      const total = input.holds.reduce((sum, h) => sum + h.holdCents, 0);
      if (!canCover(await rawBalance(acct, input.session), total)) {
        throw new ApiError(409, "insufficient_funds", "The team's budget can't cover these gifts. Top up or send to fewer people.");
      }
      if (input.holds.length === 0) return;

      const entries = input.holds.map((h) => ({
        _id: randomUUID(),
        ...holdEntry({
          accountId: acct._id,
          currency: acct.currency,
          now,
          createdBy: input.createdBy,
          giftId: h.giftId,
          campaignId: h.campaignId,
          holdNo: 1,
          holdCents: h.holdCents,
        }),
      }));
      await c().ledgerEntries.insertMany(entries, { session: input.session });
    },

    /**
     * Redemption, inside the caller's transaction (the same one that marks the
     * gift redeemed): release the whole hold, then capture what the order really
     * cost. The entries have deterministic keys, so a retry writes nothing new.
     */
    async capture(input: {
      teamKey: string;
      giftId: string;
      campaignId: string;
      holdNo: number;
      holdCents: Cents;
      captureCents: Cents;
      feeCents: Cents;
      createdBy: string;
      session: ClientSession;
    }) {
      const acct = await account(input.teamKey, input.session);
      // An order can cost more than its hold (the estimate ran low). The capture is capped at the hold and the
      // overage is a debit adjustment on the same gift, so the team is never refused or the recipient failed.
      const overage = Math.max(0, input.captureCents - input.holdCents);
      const entries = redemptionEntries({
        accountId: acct._id,
        currency: acct.currency,
        now: deps.now(),
        createdBy: input.createdBy,
        giftId: input.giftId,
        campaignId: input.campaignId,
        holdNo: input.holdNo,
        holdCents: input.holdCents,
        captureCents: input.captureCents - overage,
        feeCents: input.feeCents,
      }).map((e) => ({ _id: randomUUID(), ...e }));
      if (overage > 0) {
        entries.push({
          _id: randomUUID(),
          ...adjustmentEntry({
            accountId: acct._id,
            currency: acct.currency,
            now: deps.now(),
            createdBy: input.createdBy,
            adjustmentId: `overage-${input.giftId}-${input.holdNo}`,
            amountCents: overage,
            direction: "debit",
            reason: "Order total above the gift's hold",
            giftId: input.giftId,
            campaignId: input.campaignId,
          }),
        });
      }
      await c().ledgerEntries.insertMany(entries, { session: input.session, ordered: true });
    },

    /** Cancellation or expiry, inside the caller's transaction: give the whole hold back. */
    async release(input: { teamKey: string; giftId: string; campaignId: string; holdNo: number; holdCents: Cents; createdBy: string; session: ClientSession }) {
      const acct = await account(input.teamKey, input.session);
      await c().ledgerEntries.insertOne(
        {
          _id: randomUUID(),
          ...releaseEntry({
            accountId: acct._id,
            currency: acct.currency,
            now: deps.now(),
            createdBy: input.createdBy,
            giftId: input.giftId,
            campaignId: input.campaignId,
            holdNo: input.holdNo,
            holdCents: input.holdCents,
          }),
        },
        { session: input.session },
      );
    },

    /** What each campaign has spent: captures and fees, less refunds. */
    async spentByCampaign(teamKey: string): Promise<Map<string, Cents>> {
      const acct = await c().accounts.findOne({ teamKey }, { projection: { _id: 1 } });
      if (!acct) return new Map();
      const rows = await c()
        .ledgerEntries.aggregate<{ _id: string; spent: number }>([
          { $match: { accountId: acct._id, campaignId: { $ne: null }, type: { $in: ["capture", "fee", "refund"] } } },
          {
            $group: {
              _id: "$campaignId",
              spent: { $sum: { $cond: [{ $eq: ["$type", "refund"] }, { $multiply: ["$amountCents", -1] }, "$amountCents"] } },
            },
          },
        ])
        .toArray();
      return new Map(rows.map((r) => [r._id, r.spent]));
    },
  };
}
