/**
 * The gift state machine. Every status change goes through canTransition();
 * the database write repeats the expected "from" status in its filter, so a
 * stale or concurrent write changes nothing.
 */

export const GIFT_STATUSES = [
  "created",
  "pending_approval",
  "scheduled",
  "sent",
  "opened",
  "redeeming",
  "redeemed",
  "shipped",
  "delivered",
  "expired",
  "cancelled",
] as const;

export type GiftStatus = (typeof GIFT_STATUSES)[number];

const TRANSITIONS: Record<GiftStatus, readonly GiftStatus[]> = {
  created: ["pending_approval", "scheduled", "sent", "cancelled"],
  pending_approval: ["scheduled", "sent", "cancelled"],
  scheduled: ["sent", "cancelled"],
  sent: ["opened", "redeeming", "expired", "cancelled"],
  opened: ["redeeming", "expired", "cancelled"],
  // Back to opened when commercetools refuses (out of stock) or the claim is rolled back.
  redeeming: ["redeemed", "opened"],
  // Back to opened when the vendor cancels: refund, fresh hold, choose again.
  redeemed: ["shipped", "opened"],
  shipped: ["delivered"],
  delivered: [],
  expired: [],
  cancelled: [],
};

/** Statuses a recipient may start a claim from. */
export const CLAIMABLE_STATUSES = ["sent", "opened"] as const satisfies readonly GiftStatus[];

/**
 * Statuses whose gift has an open hold. Holds are placed on approval (or at
 * creation when no approval is needed), so pending_approval has none yet.
 */
export const HOLDING_STATUSES = ["scheduled", "sent", "opened", "redeeming"] as const satisfies readonly GiftStatus[];

export function canTransition(from: GiftStatus, to: GiftStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: GiftStatus, to: GiftStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Gift cannot move from ${from} to ${to}.`);
  }
}

export function nextStatuses(from: GiftStatus): readonly GiftStatus[] {
  return TRANSITIONS[from];
}

export function isTerminal(status: GiftStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
