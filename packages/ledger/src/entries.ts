/**
 * Ledger entry builders. Each money event becomes a fixed set of entries with
 * deterministic idempotency keys (ADR 0007); the caller inserts them in the
 * same transaction as the gift's status change.
 */
import { cents, type Cents, type Currency, ledgerKeys, type LedgerEntry } from "@gifting/domain";

/** A ledger entry before insert: the caller adds `_id`. */
export type NewLedgerEntry = Omit<LedgerEntry, "_id">;

type Base = { accountId: string; currency: Currency; now: Date; createdBy: string };
type GiftRef = Base & { giftId: string; campaignId: string; holdNo: number };

function entry(fields: Omit<NewLedgerEntry, "direction" | "reason"> & Partial<Pick<NewLedgerEntry, "direction" | "reason">>): NewLedgerEntry {
  if (fields.amountCents <= 0) throw new RangeError("Ledger amounts must be positive.");
  return { direction: null, reason: null, ...fields, amountCents: cents(fields.amountCents) };
}

/** What a gift holds: budget + shipping allowance + tax estimate + fee. */
export function holdAmount(parts: {
  budgetCents: Cents;
  shippingAllowanceCents: Cents;
  taxEstimateCents: Cents;
  feeCents: Cents;
}): Cents {
  return cents(parts.budgetCents + parts.shippingAllowanceCents + parts.taxEstimateCents + parts.feeCents);
}

export function topUpEntry(input: Base & { amountCents: Cents; paymentRef: string }): NewLedgerEntry {
  return entry({
    accountId: input.accountId,
    type: "top-up",
    amountCents: input.amountCents,
    currency: input.currency,
    giftId: null,
    campaignId: null,
    idempotencyKey: ledgerKeys.topUp(input.paymentRef),
    createdAt: input.now,
    createdBy: input.createdBy,
  });
}

function giftEntry(type: "hold" | "release" | "capture" | "fee" | "refund", ref: GiftRef, amountCents: Cents): NewLedgerEntry {
  return entry({
    accountId: ref.accountId,
    type,
    amountCents,
    currency: ref.currency,
    giftId: ref.giftId,
    campaignId: ref.campaignId,
    idempotencyKey: ledgerKeys[type](ref.giftId, ref.holdNo),
    createdAt: ref.now,
    createdBy: ref.createdBy,
  });
}

export function holdEntry(ref: GiftRef & { holdCents: Cents }): NewLedgerEntry {
  return giftEntry("hold", ref, ref.holdCents);
}

/** Expiry or cancellation: give the whole hold back. */
export function releaseEntry(ref: GiftRef & { holdCents: Cents }): NewLedgerEntry {
  return giftEntry("release", ref, ref.holdCents);
}

/**
 * Redemption: release the full hold, then charge what was actually chosen and
 * the fee. Refuses a total above the hold: the caller captures up to the hold
 * and records the overage as a separate adjustment (see the API's ledger service).
 */
export function redemptionEntries(
  ref: GiftRef & { holdCents: Cents; captureCents: Cents; feeCents: Cents },
): NewLedgerEntry[] {
  if (ref.captureCents + ref.feeCents > ref.holdCents) {
    throw new RangeError("Capture and fee exceed the hold.");
  }
  const entries = [giftEntry("release", ref, ref.holdCents), giftEntry("capture", ref, ref.captureCents)];
  if (ref.feeCents > 0) entries.push(giftEntry("fee", ref, ref.feeCents));
  return entries;
}

/** Vendor cancelled a redeemed order: give the capture back. The gift then gets a fresh hold (holdNo + 1). */
export function refundEntry(ref: GiftRef & { capturedCents: Cents }): NewLedgerEntry {
  return giftEntry("refund", ref, ref.capturedCents);
}

export function adjustmentEntry(
  input: Base & { adjustmentId: string; amountCents: Cents; direction: "credit" | "debit"; reason: string; giftId?: string; campaignId?: string },
): NewLedgerEntry {
  if (!input.reason.trim()) throw new RangeError("An adjustment needs a reason.");
  return entry({
    accountId: input.accountId,
    type: "adjustment",
    direction: input.direction,
    reason: input.reason,
    amountCents: input.amountCents,
    currency: input.currency,
    giftId: input.giftId ?? null,
    campaignId: input.campaignId ?? null,
    idempotencyKey: ledgerKeys.adjustment(input.adjustmentId),
    createdAt: input.now,
    createdBy: input.createdBy,
  });
}
