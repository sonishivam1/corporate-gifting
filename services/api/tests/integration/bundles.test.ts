import { createChannelRegistry } from "@gifting/channels";
import { OrderError, type ProductView } from "@gifting/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { memoryCatalog, seedProducts } from "../../src/modules/catalog/source";
import { address, fakeOrders, recordingChannel, tokenOf } from "./fakes";
import { createAndSubmit, type Harness, MAYA, MAYA_SALES, people, send, startHarness } from "./harness";

// Gift bundles: every recipient gets every item (plan: gift-bundles.md). Fictional data only.
let h: Harness;
const email = recordingChannel();
const shop = fakeOrders(5200);

// A catalog whose stock a test can change, to sell an item out between sending and claiming.
const products: ProductView[] = seedProducts.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v })) }));
function setStock(sku: string, available: boolean) {
  const p = products.find((x) => x.variants.some((v) => v.sku === sku))!;
  p.available = available;
  for (const v of p.variants) if (v.sku === sku) v.available = available;
}

// Each SKU lookup takes a moment, like a call to commercetools, so parallel claims really overlap.
const memory = memoryCatalog(products);
const catalog = { ...memory, variant: async (sku: string) => (await new Promise((r) => setTimeout(r, 5)), memory.variant(sku)) };

beforeAll(async () => {
  h = await startHarness({ channels: createChannelRegistry([email.channel]), orders: shop.placer, catalog });
});

afterAll(async () => {
  await h?.close();
});

// A candle (Cedar & Pine, $32) and a tea sampler (Brightleaf, $24): two vendors, $56 a gift.
const BUNDLE = ["CP-CANDLE-CEDAR", "BL-TEA-SAMPLER"];
const bundle = (skus = BUNDLE, n = 1) => send({ recipientIds: people(n), gift: { kind: "bundle", skus } });
const estimate = (body: object, headers = MAYA) => h.app.inject({ method: "POST", url: "/v1/campaigns/estimate", headers, payload: body });

let nextIp = 1;
const redeem = (token: string, payload: object = { address }) =>
  h.app.inject({ method: "POST", url: `/v1/r/${token}/redeem`, payload, remoteAddress: `10.7.${Math.floor(nextIp / 250)}.${(nextIp++ % 250) + 1}` });

async function sendBundle(skus = BUNDLE) {
  const before = email.sent.length;
  const { submitted, id } = await createAndSubmit(h.app, MAYA, bundle(skus));
  expect(submitted?.statusCode).toBe(200);
  const gift = (await h.c.gifts.findOne({ campaignId: id! }))!;
  return { id: id!, gift, token: tokenOf(email.sent[before]!) };
}

describe("sending a bundle", () => {
  it("holds the sum of its items for each gift and saves every item on the campaign", async () => {
    expect((await estimate(bundle(BUNDLE, 3))).json()).toMatchObject({ gifts: 3, holdCents: 5600, totalCents: 16_800 });

    const { id, gift } = await sendBundle();
    expect(await h.c.campaigns.findOne({ _id: id })).toMatchObject({ sku: null, skus: BUNDLE, collectionId: null, budgetCents: 5600 });
    expect(gift).toMatchObject({ budgetCents: 5600, holdCents: 5600 });

    const row = (await h.app.inject({ method: "GET", url: `/v1/campaigns/${id}`, headers: MAYA })).json();
    expect(row.gift).toMatchObject({ kind: "bundle", skus: BUNDLE, label: "Cedarwood Candle + Loose Leaf Tea Sampler" });
  });

  it("asks for approval when the bundle total crosses the team's threshold", async () => {
    // People approves above $1,000. 16 people × $56 = $896 is under it; adding the $30 mugs makes 16 × $86 = $1,376.
    expect((await estimate(bundle(BUNDLE, 16))).json()).toMatchObject({ totalCents: 89_600, needsApproval: false });
    expect((await estimate(bundle([...BUNDLE, "BL-MUG-PAIR"], 16))).json()).toMatchObject({ totalCents: 137_600, needsApproval: true });
  });

  it("keeps single gifts and collections as they were", async () => {
    const single = await createAndSubmit(h.app, MAYA, send({ recipientIds: people(1), gift: { kind: "single", sku: "BL-MUG-PAIR" } }));
    expect(await h.c.campaigns.findOne({ _id: single.id! })).not.toHaveProperty("skus");
    const row = (await h.app.inject({ method: "GET", url: `/v1/campaigns/${single.id}`, headers: MAYA })).json();
    expect(row.gift).toMatchObject({ kind: "single", sku: "BL-MUG-PAIR", skus: [] });
  });
});

describe("claiming a bundle", () => {
  it("shows every item with nothing to choose, then makes one order with every item and one capture", async () => {
    const { gift, token } = await sendBundle();
    const offered = (await h.app.inject({ method: "GET", url: `/v1/r/${token}/items` })).json();
    expect(offered).toMatchObject({ state: "open", bundle: true, allInStock: true });
    expect(offered.items.map((i: { sku: string }) => i.sku)).toEqual(BUNDLE);
    expect(JSON.stringify(offered)).not.toMatch(/price/i);

    const res = await redeem(token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ orderNumber: `GFT-${gift._id}`, sku: BUNDLE[0], skus: BUNDLE });
    expect(shop.calls.at(-1)).toMatchObject({
      orderNumber: `GFT-${gift._id}`,
      items: [
        { sku: "CP-CANDLE-CEDAR", vendorKey: "vendor-cedar-pine" },
        { sku: "BL-TEA-SAMPLER", vendorKey: "vendor-brightleaf" },
      ],
    });
    expect(await h.c.gifts.findOne({ _id: gift._id })).toMatchObject({ status: "redeemed", claim: { sku: BUNDLE[0], skus: BUNDLE, status: "ordered" } });
    const entries = (await h.c.ledgerEntries.find({ giftId: gift._id }).toArray()).map((e) => [e.type, e.amountCents]).sort();
    // The hold for the whole bundle is released and the order's one total captured.
    expect(entries).toEqual([["capture", 5200], ["hold", 5600], ["release", 5600]].sort());

    // The sender's gift row lists everything ordered.
    const rows = (await h.app.inject({ method: "GET", url: `/v1/campaigns/${gift.campaignId}/gifts`, headers: MAYA })).json();
    expect(rows.gifts[0]).toMatchObject({ chosenSku: BUNDLE[0], orderedSkus: BUNDLE });
  });

  it("ignores a SKU in the request: the bundle is ordered whole", async () => {
    const { token } = await sendBundle();
    const res = await redeem(token, { sku: "BL-MUG-PAIR", address });
    expect(res.statusCode).toBe(200);
    expect(res.json().skus).toEqual(BUNDLE);
  });

  it("makes exactly one order when many requests claim at once", async () => {
    const { gift, token } = await sendBundle();
    const before = shop.orders.size;
    const results = await Promise.all(Array.from({ length: 20 }, () => redeem(token)));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    // The others are told it was taken or to try again; none fails.
    expect(results.every((r) => [200, 409, 503].includes(r.statusCode))).toBe(true);
    expect(shop.orders.size).toBe(before + 1);
    expect(await h.c.ledgerEntries.countDocuments({ giftId: gift._id, type: "capture" })).toBe(1);
    expect(await h.c.gifts.findOne({ _id: gift._id })).toMatchObject({ status: "redeemed" });
  });
});

describe("what is refused", () => {
  it("refuses a bundle of one, of six, a repeat, two options of one product, and an unknown or sold-out item, and saves nothing", async () => {
    const before = await h.c.campaigns.countDocuments();
    const tries = [
      [["CP-CANDLE-CEDAR"], 400],
      [["CP-CANDLE-CEDAR", "BL-TEA-SAMPLER", "BL-MUG-PAIR", "CP-CANDLE-TRIO", "CP-DIFFUSER-LAV", "TH-KIT-DAYHIKE"], 400],
      [["CP-CANDLE-CEDAR", "CP-CANDLE-CEDAR"], 400],
      [["CP-CANDLE-CEDAR", "NOT-A-SKU"], 422],
    ] as const;
    for (const [skus, status] of tries) {
      const res = await h.app.inject({ method: "POST", url: "/v1/campaigns", headers: MAYA, payload: bundle([...skus]) });
      expect(res.statusCode, skus.join(",")).toBe(status);
    }
    setStock("BL-MUG-PAIR", false);
    try {
      const res = await h.app.inject({ method: "POST", url: "/v1/campaigns", headers: MAYA, payload: bundle(["CP-CANDLE-CEDAR", "BL-MUG-PAIR"]) });
      expect(res.json().error.code).toBe("item_not_eligible");
    } finally {
      setStock("BL-MUG-PAIR", true);
    }
    expect(await h.c.campaigns.countDocuments()).toBe(before);
  });

  it("refuses two options of the same product", async () => {
    const tin = products.find((p) => p.key === "CP-CANDLE-CEDAR")!;
    tin.variants.push({ sku: "CP-CANDLE-CEDAR-XL", label: "Large", priceCents: 4200, available: true, imageUrl: null });
    try {
      const res = await h.app.inject({ method: "POST", url: "/v1/campaigns", headers: MAYA, payload: bundle(["CP-CANDLE-CEDAR", "CP-CANDLE-CEDAR-XL"]) });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("bundle_same_product");
    } finally {
      tin.variants.pop();
    }
  });

  it("orders nothing while any item is sold out, and lets the recipient claim once it is back", async () => {
    const { gift, token } = await sendBundle();
    const before = shop.calls.length;
    setStock("BL-TEA-SAMPLER", false);
    try {
      expect((await h.app.inject({ method: "GET", url: `/v1/r/${token}/items` })).json()).toMatchObject({ bundle: true, allInStock: false });
      const res = await redeem(token);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("bundle_unavailable");
      expect(shop.calls.length).toBe(before);
    } finally {
      setStock("BL-TEA-SAMPLER", true);
    }
    // Never claimed: still waiting for the recipient, with no claim and no capture.
    expect(await h.c.gifts.findOne({ _id: gift._id })).toMatchObject({ status: "sent", claim: null });
    expect(await h.c.ledgerEntries.countDocuments({ giftId: gift._id, type: "capture" })).toBe(0);
    expect((await redeem(token)).statusCode).toBe(200);
  });

  it("orders nothing when the platform says an item sold out, and keeps the gift claimable", async () => {
    const { gift, token } = await sendBundle();
    shop.failNext(new OrderError("out_of_stock", "gone"));
    const res = await redeem(token);
    expect(res.json().error.code).toBe("bundle_unavailable");
    expect(await h.c.gifts.findOne({ _id: gift._id })).toMatchObject({ status: "opened", claim: null });
    expect(await h.c.ledgerEntries.countDocuments({ giftId: gift._id, type: "capture" })).toBe(0);
    expect((await redeem(token)).statusCode).toBe(200);
  });

  it("keeps another team's bundle campaign out of reach", async () => {
    const { id } = await sendBundle();
    expect((await h.app.inject({ method: "GET", url: `/v1/campaigns/${id}`, headers: MAYA_SALES })).statusCode).toBe(404);
  });
});
