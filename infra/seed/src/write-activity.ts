/**
 * Demo activity for the sender Home (plan: sender-home-redesign.md): a few
 * sent campaigns per demo team over the last 30 days, with gifts at every
 * stage (waiting, opened, chosen, shipped, delivered, expired) and the dates
 * they got there. The ledger matches: a hold per gift, then a capture when a
 * gift was chosen or a release when its link expired, so available, held and
 * spent stay consistent.
 *
 * Idempotent: fixed ids and ledger keys, so a second run writes nothing new.
 * The dates are relative to the first run. To move the activity to today,
 * drop the local database and seed again (see getting-started.md).
 *
 * Used by `pnpm seed:demo` only, not by the integration tests: they start
 * from no activity.
 */
import { createHash, randomUUID } from "node:crypto";

import { getCollections } from "@gifting/db";
import { cents, type Gift, type GiftStatus, orderNumberForGift } from "@gifting/domain";
import { holdEntry, type NewLedgerEntry, redemptionEntries, releaseEntry } from "@gifting/ledger";
import type { Db } from "mongodb";

import { demoCompany, demoDirectory, products } from "./index";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const isDuplicate = (err: unknown) => (err as { code?: unknown }).code === 11000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

type DemoCampaign = {
  key: string;
  teamKey: string;
  name: string;
  occasion: "thanks" | "birthday" | "anniversary" | "newhire" | "appreciation" | "holiday";
  collectionId: string;
  budgetCents: number;
  daysAgo: number;
  recipients: number;
  expiresInDays: number;
};

export const demoActivity: DemoCampaign[] = [
  { key: "q3-thanks", teamKey: "team-lumen-people", name: "Q3 thank-you", occasion: "thanks", collectionId: "col-treats", budgetCents: 5000, daysAgo: 27, recipients: 10, expiresInDays: 14 },
  { key: "anniversaries-oct", teamKey: "team-lumen-people", name: "October work anniversaries", occasion: "anniversary", collectionId: "col-cozy", budgetCents: 6000, daysAgo: 19, recipients: 6, expiresInDays: 30 },
  { key: "new-joiners", teamKey: "team-lumen-people", name: "New joiner welcome", occasion: "newhire", collectionId: "col-all", budgetCents: 5000, daysAgo: 11, recipients: 8, expiresInDays: 30 },
  { key: "launch-crew", teamKey: "team-lumen-people", name: "Launch crew appreciation", occasion: "appreciation", collectionId: "col-outdoor", budgetCents: 7500, daysAgo: 4, recipients: 12, expiresInDays: 30 },
  { key: "birthdays-week", teamKey: "team-lumen-people", name: "Birthdays this week", occasion: "birthday", collectionId: "col-treats", budgetCents: 5000, daysAgo: 1, recipients: 5, expiresInDays: 7 },
  { key: "client-thanks", teamKey: "team-lumen-sales", name: "Client thank-you", occasion: "thanks", collectionId: "col-holiday", budgetCents: 7500, daysAgo: 22, recipients: 9, expiresInDays: 30 },
  { key: "deal-closers", teamKey: "team-lumen-sales", name: "Deal closers", occasion: "appreciation", collectionId: "col-outdoor", budgetCents: 10_000, daysAgo: 8, recipients: 7, expiresInDays: 30 },
  { key: "renewals", teamKey: "team-lumen-sales", name: "Renewal thank-you", occasion: "thanks", collectionId: "col-treats", budgetCents: 5000, daysAgo: 2, recipients: 6, expiresInDays: 30 },
];

/**
 * Where gift `i` of a campaign sent `age` days ago has got to, and when it got
 * to each stage (hours after it was sent). Older sends have moved further.
 */
export function journey(i: number, age: number, expiresInDays: number): { status: GiftStatus; hours: Partial<Record<GiftStatus, number>> } {
  const roll = (i * 37 + age * 11) % 100;
  const opened = 2 + (i % 5) * 3;
  const chose = opened + 6 + (i % 4) * 9;
  const shipped = chose + 30;
  const delivered = shipped + 60;
  const ageHours = age * 24 - 1;
  const can = (h: number) => h <= ageHours;

  // Some never open, some open and wait; the rest choose.
  if (roll < 12) return age > expiresInDays ? { status: "expired", hours: { sent: 0, expired: expiresInDays * 24 } } : { status: "sent", hours: { sent: 0 } };
  if (roll < 28 || !can(chose)) {
    if (!can(opened)) return { status: "sent", hours: { sent: 0 } };
    return age > expiresInDays ? { status: "expired", hours: { sent: 0, opened, expired: expiresInDays * 24 } } : { status: "opened", hours: { sent: 0, opened } };
  }
  const base = { sent: 0, opened, redeeming: chose, redeemed: chose + 0.05 };
  if (can(delivered)) return { status: "delivered", hours: { ...base, shipped, delivered } };
  if (can(shipped)) return { status: "shipped", hours: { ...base, shipped } };
  return { status: "redeemed", hours: base };
}

export async function writeDemoActivity(db: Db, now = new Date()) {
  const c = getCollections(db);
  const counts = { campaigns: 0, gifts: 0, ledgerEntries: 0, skipped: 0 };
  const insertLedger = async (entry: NewLedgerEntry) => {
    try {
      await c.ledgerEntries.insertOne({ _id: randomUUID(), ...entry });
      counts.ledgerEntries += 1;
    } catch (err) {
      if (!isDuplicate(err)) throw err;
    }
  };

  for (const demo of demoActivity) {
    const account = await c.accounts.findOne({ teamKey: demo.teamKey }, { projection: { _id: 1 } });
    if (!account) throw new Error(`No account for ${demo.teamKey}; run the demo top-ups first.`);
    const campaignId = `demo-cmp-${demo.key}`;
    const sentAt = new Date(now.getTime() - demo.daysAgo * DAY);
    const recipients = demoDirectory.slice(0, demo.recipients);
    const eligible = products.filter((p) => p.priceCents <= demo.budgetCents);

    const campaign = await c.campaigns.updateOne(
      { _id: campaignId },
      {
        $setOnInsert: {
          companyKey: demoCompany.key,
          teamKey: demo.teamKey,
          name: demo.name,
          type: "one-time",
          status: "active",
          collectionId: demo.collectionId,
          sku: null,
          budgetCents: cents(demo.budgetCents),
          channels: ["email"],
          branding: { brandColor: null, logoUrl: null },
          greeting: { occasion: demo.occasion, cover: "confetti", headline: "Thank you!", fromName: "Maya Chen" },
          message: "A small thank-you from all of us.",
          recipientIds: recipients.map((r) => r.id),
          reminders: true,
          expiresInDays: demo.expiresInDays,
          sendAt: null,
          approval: null,
          trigger: null,
          createdBy: "user-maya",
          createdAt: sentAt,
          updatedAt: sentAt,
        },
      },
      { upsert: true },
    );
    if (campaign.upsertedCount === 0) {
      counts.skipped += 1;
      continue;
    }
    counts.campaigns += 1;

    for (const [i, person] of recipients.entries()) {
      const giftId = `demo-gift-${demo.key}-${String(i + 1).padStart(2, "0")}`;
      const { status, hours } = journey(i, demo.daysAgo, demo.expiresInDays);
      const at = (h: number) => new Date(sentAt.getTime() + i * 7 * 60_000 + h * HOUR);
      const statusAt = Object.fromEntries(Object.entries(hours).map(([s, h]) => [s, at(h!)])) as Gift["statusAt"];
      const chosen = hours.redeeming !== undefined;
      const product = eligible[(i + demo.daysAgo) % eligible.length]!;
      const holdCents = cents(demo.budgetCents);
      const ref = { accountId: account._id, currency: "USD" as const, giftId, campaignId, holdNo: 1, createdBy: "seed:demo" };

      const gift: Gift = {
        _id: giftId,
        companyKey: demoCompany.key,
        teamKey: demo.teamKey,
        campaignId,
        recipientId: person.id,
        occurrence: "once",
        budgetCents: holdCents,
        holdCents,
        holdNo: 1,
        tokenHash: sha256(`demo-token:${giftId}`),
        codeHash: sha256(`demo-code:${giftId}`),
        status,
        statusAt,
        version: Object.keys(hours).length,
        expiresAt: new Date(sentAt.getTime() + demo.expiresInDays * DAY),
        claim: chosen ? { sku: product.sku, idempotencyKey: `demo-claim:${giftId}`, status: "ordered", startedAt: at(hours.redeeming!), failureCode: null } : null,
        notifications: [{ channel: "email", kind: "send", reminderNo: 0, providerMessageId: null, status: "delivered", at: at(0) }],
        ctOrderNumber: chosen ? orderNumberForGift(giftId) : null,
        createdAt: at(0),
        updatedAt: at(Math.max(...Object.values(hours).map((h) => h!))),
      };
      try {
        await c.gifts.insertOne(gift);
        counts.gifts += 1;
      } catch (err) {
        if (!isDuplicate(err)) throw err;
      }

      await insertLedger(holdEntry({ ...ref, holdCents, now: at(0) }));
      if (chosen) {
        for (const entry of redemptionEntries({ ...ref, holdCents, captureCents: cents(product.priceCents), feeCents: cents(0), now: at(hours.redeeming!) })) await insertLedger(entry);
      } else if (status === "expired") {
        await insertLedger(releaseEntry({ ...ref, holdCents, now: at(hours.expired!) }));
      }
    }
  }
  return counts;
}
