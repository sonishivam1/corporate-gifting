import { OrderError } from "@gifting/domain";
import { describe, expect, it } from "vitest";

import type { CtApi } from "@gifting/ct";
import { createCtOrderPlacer, orderWritesAllowed } from "./orders";

type Sent = { cart?: unknown; payment?: unknown; addPayment?: unknown; order?: unknown };

/** A stand-in for the commercetools API that records what we send, so the order payloads can be checked offline. */
function fakeApi(options: { available?: number; soldOut?: string[]; existing?: boolean; total?: number } = {}) {
  const sent: Sent = {};
  const notFound = Object.assign(new Error("not found"), { statusCode: 404 });
  const total = options.total ?? 5631;
  const order = { id: "ord-1", orderNumber: "GFT-g1", createdAt: new Date().toISOString(), totalPrice: { centAmount: total - 331 }, taxedPrice: { totalGross: { centAmount: total } } };
  const store = {
    carts: () => ({
      post: ({ body }: { body: unknown }) => ({ execute: async () => ((sent.cart = body), { body: { id: "cart-1", version: 1, totalPrice: { currencyCode: "USD", centAmount: total - 331 }, taxedPrice: { totalGross: { currencyCode: "USD", centAmount: total } } } }) }),
      withId: () => ({ post: ({ body }: { body: unknown }) => ({ execute: async () => ((sent.addPayment = body), { body: { id: "cart-1", version: 2 } }) }) }),
    }),
    orders: () => ({ post: ({ body }: { body: unknown }) => ({ execute: async () => ((sent.order = body), { body: order }) }) }),
  };
  const api = {
    orders: () => ({ withOrderNumber: () => ({ get: () => ({ execute: async () => (options.existing ? { body: order } : Promise.reject(notFound)) }) }) }),
    channels: () => ({
      withKey: ({ key }: { key: string }) => ({ get: () => ({ execute: async () => (key === "vendor-missing" ? Promise.reject(notFound) : { body: { id: key === "vendor-north-bakery" ? "ch-1" : `ch-${key}` } }) }) }),
    }),
    inventory: () => ({
      get: ({ queryArgs }: { queryArgs: { where: string } }) => ({
        execute: async () => ({ body: { results: [{ availableQuantity: options.soldOut?.some((sku) => queryArgs.where.includes(`"${sku}"`)) ? 0 : (options.available ?? 10) }] } }),
      }),
    }),
    payments: () => ({ post: ({ body }: { body: unknown }) => ({ execute: async () => ((sent.payment = body), { body: { id: "pay-1" } }) }) }),
    inStoreKeyWithStoreKeyValue: () => store,
  } as unknown as CtApi;
  return { api, sent };
}

const input = {
  orderNumber: "GFT-g1", giftId: "g1", campaignId: "c1", companyKey: "company-lumen", teamKey: "team-people", items: [{ sku: "SKU-1", vendorKey: "vendor-north-bakery" }],
  captureKey: "capture:g1:1", recipient: { name: "Priya Nair", email: "priya@example.com" },
  shipTo: { name: "Priya Nair", line1: "200 Sample Ave", line2: null, city: "Austin", region: "TX", postalCode: "78701", country: "US" as const },
};

describe("creating a redemption order on commercetools", () => {
  it("refuses unless writes are allowed", async () => {
    await expect(createCtOrderPlacer(fakeApi().api, { allowWrites: false }).place(input)).rejects.toMatchObject({ code: "not_supported" });
  });

  it("allows writes only on a sandbox project or one the owner named", () => {
    expect(orderWritesAllowed({ projectKey: "gifting-sandbox" })).toBe(true);
    expect(orderWritesAllowed({ projectKey: "corporate-gifting" })).toBe(false);
    expect(orderWritesAllowed({ projectKey: "corporate-gifting", setupProjectKey: "corporate-gifting" })).toBe(true);
  });

  it("builds the cart in the gifting store: the vendor's channel, the recipient's address, stock reserved", async () => {
    const { api, sent } = fakeApi();
    await createCtOrderPlacer(api, { allowWrites: true }).place(input);
    expect(sent.cart).toMatchObject({
      inventoryMode: "ReserveOnOrder",
      lineItems: [{ sku: "SKU-1", quantity: 1, supplyChannel: { typeId: "channel", id: "ch-1" } }],
      shippingAddress: { firstName: "Priya", lastName: "Nair", city: "Austin", state: "TX", country: "US" },
      shippingMethod: { key: "vendor-standard" },
    });
  });

  it("records a company-balance payment for the full total, with the capture key as the interaction id", async () => {
    const { api, sent } = fakeApi();
    await createCtOrderPlacer(api, { allowWrites: true }).place(input);
    expect(sent.payment).toMatchObject({
      amountPlanned: { centAmount: 5631, currencyCode: "USD" },
      paymentMethodInfo: { method: "company-balance" },
      transactions: [{ type: "Charge", state: "Success", amount: { centAmount: 5631 }, interactionId: "capture:g1:1" }],
      // Two gifts of one campaign must not share this, or the second order is refused.
      interfaceId: "GFT-g1",
      custom: { type: { key: "company-balance-payment" }, fields: { captureKey: "capture:g1:1", giftId: "g1", companyKey: "company-lumen", teamKey: "team-people" } },
    });
  });

  it("numbers the order and links it back to the gift, campaign, company, team and vendor", async () => {
    const { api, sent } = fakeApi();
    const order = await createCtOrderPlacer(api, { allowWrites: true }).place(input);
    expect(sent.order).toMatchObject({ orderNumber: "GFT-g1", paymentState: "Paid", custom: { type: { key: "gift-order" }, fields: { giftId: "g1", campaignId: "c1", companyKey: "company-lumen", teamKey: "team-people", vendorKey: "vendor-north-bakery" } } });
    expect(order).toEqual({ orderNumber: "GFT-g1", orderId: "ord-1", totalCents: 5631, status: "open" });
  });

  it("places an order whatever it costs; the ledger settles any difference from the hold", async () => {
    const { api, sent } = fakeApi({ total: 7100 });
    expect(await createCtOrderPlacer(api, { allowWrites: true }).place(input)).toMatchObject({ totalCents: 7100 });
    expect(sent.order).toBeDefined();
  });

  it("returns the existing order instead of making a second one", async () => {
    const { api, sent } = fakeApi({ existing: true });
    expect(await createCtOrderPlacer(api, { allowWrites: true }).place(input)).toMatchObject({ orderNumber: "GFT-g1", totalCents: 5631 });
    expect(sent.cart).toBeUndefined();
  });

  it("says out of stock when the vendor has none", async () => {
    const { api } = fakeApi({ available: 0 });
    const placer = createCtOrderPlacer(api, { allowWrites: true });
    await expect(placer.place(input)).rejects.toBeInstanceOf(OrderError);
    await expect(placer.place(input)).rejects.toMatchObject({ code: "out_of_stock" });
  });

  it("refuses a vendor that is not in the project, and keys that could break a query", async () => {
    const placer = createCtOrderPlacer(fakeApi().api, { allowWrites: true });
    await expect(placer.place({ ...input, items: [{ sku: "SKU-1", vendorKey: "vendor-missing" }] })).rejects.toMatchObject({ code: "not_supported" });
    await expect(placer.place({ ...input, items: [{ sku: 'x" or sku="y', vendorKey: "vendor-north-bakery" }] })).rejects.toMatchObject({ code: "not_supported" });
    await expect(placer.place({ ...input, items: [] })).rejects.toMatchObject({ code: "not_supported" });
  });

  it("keeps single-gift orders on the fields every project has: no vendorKeys", async () => {
    const { api, sent } = fakeApi();
    await createCtOrderPlacer(api, { allowWrites: true }).place(input);
    expect((sent.order as { custom: { fields: object } }).custom.fields).not.toHaveProperty("vendorKeys");
  });
});

describe("a bundle order (plan: gift-bundles.md)", () => {
  const bundle = {
    ...input,
    items: [
      { sku: "SKU-1", vendorKey: "vendor-north-bakery" },
      { sku: "MUG-1", vendorKey: "vendor-clay-co" },
      { sku: "SKU-2", vendorKey: "vendor-north-bakery" },
    ],
  };

  it("is one cart with a line per item, each on its own vendor's channel", async () => {
    const { api, sent } = fakeApi();
    await createCtOrderPlacer(api, { allowWrites: true }).place(bundle);
    expect((sent.cart as { lineItems: unknown[] }).lineItems).toEqual([
      { sku: "SKU-1", quantity: 1, supplyChannel: { typeId: "channel", id: "ch-1" } },
      { sku: "MUG-1", quantity: 1, supplyChannel: { typeId: "channel", id: "ch-vendor-clay-co" } },
      { sku: "SKU-2", quantity: 1, supplyChannel: { typeId: "channel", id: "ch-1" } },
    ]);
  });

  it("is one order and one payment for the whole total, listing every vendor once", async () => {
    const { api, sent } = fakeApi();
    expect(await createCtOrderPlacer(api, { allowWrites: true }).place(bundle)).toEqual({ orderNumber: "GFT-g1", orderId: "ord-1", totalCents: 5631, status: "open" });
    expect(sent.payment).toMatchObject({ amountPlanned: { centAmount: 5631 }, transactions: [{ interactionId: "capture:g1:1" }] });
    expect(sent.order).toMatchObject({ orderNumber: "GFT-g1", custom: { fields: { vendorKey: "vendor-north-bakery", vendorKeys: ["vendor-north-bakery", "vendor-clay-co"] } } });
  });

  it("places nothing when any one item is sold out", async () => {
    const { api, sent } = fakeApi({ soldOut: ["MUG-1"] });
    await expect(createCtOrderPlacer(api, { allowWrites: true }).place(bundle)).rejects.toMatchObject({ code: "out_of_stock" });
    expect(sent.cart).toBeUndefined();
    expect(sent.payment).toBeUndefined();
    expect(sent.order).toBeUndefined();
  });
});
