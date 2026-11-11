import type { Address } from "./address";

/** Shipping progress of an order, mirrored from the commerce platform. */
export const ORDER_STATUSES = ["open", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderItem = { sku: string; vendorKey: string };

export type PlaceOrderInput = {
  /** `GFT-<giftId>` from orderNumberForGift(). The idempotency key of the call. */
  orderNumber: string;
  giftId: string;
  campaignId: string;
  companyKey: string;
  teamKey: string;
  /**
   * What ships, one of each: one item, or a bundle's items. Each comes from the
   * vendor that owns it (its supply channel in the commerce platform). The order
   * is placed only if every item is in stock.
   */
  items: readonly OrderItem[];
  /** The ledger capture key. It becomes the payment transaction's interaction id. */
  captureKey: string;
  recipient: { name: string; email: string };
  shipTo: Address;
};

export type PlacedOrder = {
  orderNumber: string;
  /** The commerce platform's own id. */
  orderId: string;
  /** What the order cost in full: item, shipping and tax. */
  totalCents: number;
  status: OrderStatus;
};

export type OrderErrorCode =
  /** An item sold out. Nothing is ordered; the recipient chooses again, or tries a bundle again later. */
  | "out_of_stock"
  /** The platform could not be reached or answered with an error. Look the order up before retrying. */
  | "unavailable"
  /** Order creation is switched off for this project, or the platform refused the order. A setup problem, not the recipient's. */
  | "not_supported";

export class OrderError extends Error {
  constructor(
    readonly code: OrderErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "OrderError";
  }
}

/**
 * Creates the commerce order for a claimed gift. commercetools is the first
 * implementation (@gifting/ct); a commerce connector can replace it later.
 * `place` is idempotent by order number: a second call returns the order that exists.
 */
export interface OrderPlacer {
  place(input: PlaceOrderInput): Promise<PlacedOrder>;
  /** Looks an order up by number, for retries and the stuck-claim reconciler. Null if there is none. */
  find(orderNumber: string): Promise<PlacedOrder | null>;
}

/** Extra percent of the gift budget held at send to cover shipping and tax, which are only known at redemption. */
export function estimateExtraCents(budgetCents: number, percent: number): number {
  if (!Number.isSafeInteger(budgetCents) || budgetCents < 0) throw new RangeError("budgetCents must be a non-negative integer.");
  if (!(percent >= 0 && percent <= 100)) throw new RangeError("The estimate percent must be from 0 to 100.");
  return Math.ceil((budgetCents * percent) / 100);
}
