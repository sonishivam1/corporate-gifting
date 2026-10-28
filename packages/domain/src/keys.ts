/**
 * Deterministic keys. The same operation always builds the same key, so a
 * retry hits a unique index and writes nothing new (ADR 0007).
 */

function part(name: string, value: string): string {
  if (!value || /[:\s]/.test(value)) {
    throw new RangeError(`${name} must be non-empty and contain no colons or spaces.`);
  }
  return value;
}

function holdNumber(holdNo: number): string {
  if (!Number.isSafeInteger(holdNo) || holdNo < 1) throw new RangeError("holdNo must be a positive integer.");
  return String(holdNo);
}

export const ledgerKeys = {
  topUp: (paymentRef: string) => `top-up:${part("paymentRef", paymentRef)}`,
  hold: (giftId: string, holdNo: number) => `hold:${part("giftId", giftId)}:${holdNumber(holdNo)}`,
  release: (giftId: string, holdNo: number) => `release:${part("giftId", giftId)}:${holdNumber(holdNo)}`,
  capture: (giftId: string, holdNo: number) => `capture:${part("giftId", giftId)}:${holdNumber(holdNo)}`,
  fee: (giftId: string, holdNo: number) => `fee:${part("giftId", giftId)}:${holdNumber(holdNo)}`,
  refund: (giftId: string, holdNo: number) => `refund:${part("giftId", giftId)}:${holdNumber(holdNo)}`,
  adjustment: (adjustmentId: string) => `adjustment:${part("adjustmentId", adjustmentId)}`,
} as const;

const ORDER_PREFIX = "GFT-";

/** The commercetools order number for a gift. Unique, so a gift can never produce two orders. */
export function orderNumberForGift(giftId: string): string {
  return `${ORDER_PREFIX}${part("giftId", giftId)}`;
}

export function giftIdFromOrderNumber(orderNumber: string): string | null {
  return orderNumber.startsWith(ORDER_PREFIX) && orderNumber.length > ORDER_PREFIX.length
    ? orderNumber.slice(ORDER_PREFIX.length)
    : null;
}

/** The occurrence key for a milestone gift: one gift per campaign, recipient and date. */
export function occurrenceKey(date: { year: number; month: number; day: number }): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}
