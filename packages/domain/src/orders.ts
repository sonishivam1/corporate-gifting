import type { Address } from "./address";

/** Shipping progress of an order, mirrored from the commerce platform. */
export const ORDER_STATUSES = ["open", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type PlaceOrderInput = {
  /** `GFT-<giftId>` from orderNumberForGift(). The idempotency key of the call. */
  orderNumber: string;
  giftId: string;
  campaignId: string;
  companyKey: string;
  teamKey: string;
  /** The vendor that owns the item: its supply channel in the commerce platform. */
  vendorKey: string;
  sku: string;
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
  /** The item sold out. The recipient chooses again. */
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
