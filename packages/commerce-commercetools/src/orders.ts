import type { CartDraft, Order } from "@commercetools/platform-sdk";
import { OrderError, type OrderPlacer, type OrderStatus, type PlacedOrder, type PlaceOrderInput } from "@gifting/domain";

import { CT_LOCALE, type CtApi, type CtConfig, isNotFound, maySetUpProject } from "@gifting/ct";

/** Custom types created by `pnpm ct:apply` (docs/architecture/commercetools.md). */
export const GIFT_ORDER_TYPE_KEY = "gift-order";
export const BALANCE_PAYMENT_TYPE_KEY = "company-balance-payment";

const SAFE_KEY = /^[A-Za-z0-9._-]+$/;

export type CtOrderOptions = {
  /** Creating orders writes to the project, so it must be switched on. See orderWritesAllowed(). */
  allowWrites: boolean;
  storeKey?: string;
  shippingMethodKey?: string;
};

/** Orders are written only to a sandbox or dev project, or one the owner has named in CTP_SETUP_PROJECT_KEY. */
export function orderWritesAllowed(config: Pick<CtConfig, "projectKey" | "setupProjectKey">): boolean {
  return maySetUpProject(config);
}

const statusOf = (shipmentState: string | undefined): OrderStatus => (shipmentState === "Delivered" ? "delivered" : shipmentState === "Shipped" ? "shipped" : "open");
const httpStatus = (err: unknown): number | undefined => (err as { statusCode?: number })?.statusCode ?? (err as { code?: number })?.code;
const codes = (err: unknown): string[] => ((err as { body?: { errors?: Array<{ code?: string }> } })?.body?.errors ?? []).map((e) => e.code ?? "").filter(Boolean);

const splitName = (full: string): { firstName: string; lastName: string } => {
  const [first = "", ...rest] = full.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") || first };
};

function placed(order: Order): PlacedOrder {
  return {
    orderNumber: order.orderNumber ?? "",
    orderId: order.id,
    // Gross: item, shipping and tax together. This is what the gift costs the team.
    totalCents: (order.taxedPrice?.totalGross ?? order.totalPrice).centAmount,
    status: statusOf(order.shipmentState),
  };
}

/**
 * The gift-order fields. `vendorKey` is the first item's vendor (the field is
 * required). `vendorKeys` lists every vendor and is written only for bundles, so
 * single-gift orders work on a project whose type predates the field.
 */
function orderFields(input: PlaceOrderInput, vendorKey: string, vendorKeys: readonly string[]) {
  const base = { giftId: input.giftId, campaignId: input.campaignId, companyKey: input.companyKey, teamKey: input.teamKey, vendorKey };
  return input.items.length > 1 ? { ...base, vendorKeys } : base;
}

/**
 * Creates the redemption order in commercetools (ADR 0005):
 *   1. stock is checked for every item at its vendor's supply channel; one sold-out
 *      item stops the whole order, so a bundle never ships short;
 *   2. a cart in the gifting store with one line per item, each on its vendor's
 *      channel, shipped to the recipient, reserving stock on order (commercetools
 *      works out shipping and tax);
 *   3. the total must fit the gift's hold, or the item is refused;
 *   4. a `company-balance` Payment with a successful Charge, so the order is paid and
 *      the recipient sees no payment step. Its interaction id is the ledger capture key;
 *   5. the order, numbered GFT-<giftId>, linked back to the gift and campaign.
 * Idempotent by order number.
 */
export function createCtOrderPlacer(api: CtApi, options: CtOrderOptions): OrderPlacer {
  const { allowWrites, storeKey = "gifting", shippingMethodKey = "vendor-standard" } = options;
  const store = () => api.inStoreKeyWithStoreKeyValue({ storeKey });
  const unavailable = (err: unknown) => new OrderError("unavailable", `commercetools request failed: ${(err as Error).message}`, { cause: err });

  async function findOrder(orderNumber: string): Promise<Order | null> {
    try {
      return (await api.orders().withOrderNumber({ orderNumber }).get().execute()).body;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw unavailable(err);
    }
  }

  return {
    async find(orderNumber) {
      const order = await findOrder(orderNumber);
      return order ? placed(order) : null;
    },

    async place(input: PlaceOrderInput): Promise<PlacedOrder> {
      if (!allowWrites) throw new OrderError("not_supported", "Order creation is off for this commercetools project (name it in CTP_SETUP_PROJECT_KEY if it is a POC project).");
      const first = input.items[0];
      if (!first) throw new OrderError("not_supported", "The order has no items.");
      if (input.items.some((i) => !SAFE_KEY.test(i.sku) || !SAFE_KEY.test(i.vendorKey))) throw new OrderError("not_supported", "An item or vendor key is not valid.");

      const existing = await findOrder(input.orderNumber);
      if (existing) return placed(existing);

      try {
        // 1. Stock, for every item at its vendor's supply channel, before anything is written.
        const vendorKeys = [...new Set(input.items.map((i) => i.vendorKey))];
        const channels = new Map(await Promise.all(vendorKeys.map(async (key) => [key, (await api.channels().withKey({ key }).get().execute()).body.id] as const)));
        for (const item of input.items) {
          const stock = await api.inventory().get({ queryArgs: { where: `sku="${item.sku}" and supplyChannel(id="${channels.get(item.vendorKey)}")`, limit: 1 } }).execute();
          if ((stock.body.results[0]?.availableQuantity ?? 0) <= 0) throw new OrderError("out_of_stock", `${item.sku} is out of stock.`);
        }

        // 2. The cart: one line per item, shipped to the recipient, stock reserved on order.
        const a = input.shipTo;
        const draft: CartDraft = {
          currency: "USD",
          country: a.country,
          locale: CT_LOCALE,
          customerEmail: input.recipient.email,
          inventoryMode: "ReserveOnOrder",
          shippingAddress: { ...splitName(a.name), streetName: a.line1, ...(a.line2 ? { additionalStreetInfo: a.line2 } : {}), city: a.city, state: a.region, postalCode: a.postalCode, country: a.country, email: input.recipient.email },
          shippingMethod: { typeId: "shipping-method", key: shippingMethodKey },
          lineItems: input.items.map((i) => ({ sku: i.sku, quantity: 1, supplyChannel: { typeId: "channel", id: channels.get(i.vendorKey)! } })),
        };
        const cart = (await store().carts().post({ body: draft }).execute()).body;

        // 3. The total (item, shipping, tax) is the real cost. It may exceed the hold; the ledger settles the difference.
        const total = cart.taxedPrice?.totalGross ?? cart.totalPrice;

        // 4. A Payment already paid by the company's balance: the recipient pays nothing.
        const payment = (
          await api
            .payments()
            .post({
              body: {
                key: `pay-${input.orderNumber}`,
                // Unique per payment with the interface, so it is the order number, never the campaign.
                interfaceId: input.orderNumber,
                amountPlanned: { currencyCode: total.currencyCode, centAmount: total.centAmount },
                paymentMethodInfo: { paymentInterface: "gifting", method: "company-balance" },
                transactions: [{ type: "Charge", state: "Success", timestamp: new Date().toISOString(), amount: { currencyCode: total.currencyCode, centAmount: total.centAmount }, interactionId: input.captureKey }],
                custom: { type: { typeId: "type", key: BALANCE_PAYMENT_TYPE_KEY }, fields: { captureKey: input.captureKey, giftId: input.giftId, companyKey: input.companyKey, teamKey: input.teamKey } },
              },
            })
            .execute()
        ).body;
        const withPayment = (await store().carts().withId({ ID: cart.id }).post({ body: { version: cart.version, actions: [{ action: "addPayment", payment: { typeId: "payment", id: payment.id } }] } }).execute()).body;

        // 5. The order, numbered GFT-<giftId>.
        const order = (
          await store()
            .orders()
            .post({
              body: {
                id: withPayment.id,
                version: withPayment.version,
                orderNumber: input.orderNumber,
                paymentState: "Paid",
                custom: { type: { typeId: "type", key: GIFT_ORDER_TYPE_KEY }, fields: orderFields(input, first.vendorKey, vendorKeys) },
              },
            })
            .execute()
        ).body;
        return placed(order);
      } catch (err) {
        if (err instanceof OrderError) throw err;
        // Two requests raced and the other made the order first: that is success.
        if (codes(err).includes("DuplicateField")) {
          const raced = await findOrder(input.orderNumber);
          if (raced) return placed(raced);
        }
        if (codes(err).includes("OutOfStock")) throw new OrderError("out_of_stock", `${input.items.map((i) => i.sku).join(", ")}: an item is out of stock.`);
        if (isNotFound(err)) throw new OrderError("not_supported", "The vendor channel was not found in commercetools.", { cause: err });
        // A bad request will not be fixed by retrying; anything else (network, 5xx) may be.
        if (httpStatus(err) === 400) throw new OrderError("not_supported", `commercetools refused the order: ${codes(err).join(", ") || (err as Error).message}`, { cause: err });
        throw unavailable(err);
      }
    },
  };
}
