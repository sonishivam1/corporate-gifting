/**
 * The balance rule: the one place a budget account's balance is computed.
 *
 *   available = top-ups + credit limit + refunds + credit adjustments
 *             − open holds − captures − fees − debit adjustments
 *   open holds = holds − releases
 *
 * Balances are never stored (ADR 0007). Entries with a repeated idempotency
 * key are counted once; the unique index should already have refused them.
 */
import type { Cents, LedgerEntry } from "@gifting/domain";

export type Balance = {
  available: Cents;
  openHolds: Cents;
  toppedUp: Cents;
  captured: Cents;
  fees: Cents;
  refunded: Cents;
  adjusted: number;
  creditLimit: Cents;
};

type BalanceEntry = Pick<LedgerEntry, "type" | "amountCents" | "direction" | "idempotencyKey">;

export function computeBalance(entries: readonly BalanceEntry[], creditLimitCents: Cents = 0): Balance {
  const seen = new Set<string>();
  const totals = { "top-up": 0, hold: 0, release: 0, capture: 0, fee: 0, refund: 0 };
  let adjusted = 0;

  for (const e of entries) {
    if (seen.has(e.idempotencyKey)) continue;
    seen.add(e.idempotencyKey);
    if (e.type === "adjustment") {
      adjusted += e.direction === "debit" ? -e.amountCents : e.amountCents;
    } else {
      totals[e.type] += e.amountCents;
    }
  }

  const openHolds = totals.hold - totals.release;
  const available =
    totals["top-up"] + creditLimitCents + totals.refund + adjusted - openHolds - totals.capture - totals.fee;

  return {
    available,
    openHolds,
    toppedUp: totals["top-up"],
    captured: totals.capture,
    fees: totals.fee,
    refunded: totals.refund,
    adjusted,
    creditLimit: creditLimitCents,
  };
}

/** Whether the account can cover `amountCents` more in holds. */
export function canCover(balance: Balance, amountCents: Cents): boolean {
  return balance.available >= amountCents;
}
