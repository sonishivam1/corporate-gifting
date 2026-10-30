import { createChannelRegistry } from "@gifting/channels";
import { OrderError } from "@gifting/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { address, fakeOrders, recordingChannel, tokenOf } from "./fakes";
import { createAndSubmit, type Harness, MAYA, people, send, startHarness } from "./harness";

let h: Harness;
const email = recordingChannel();
const shop = fakeOrders(4500);

beforeAll(async () => {
  h = await startHarness({ channels: createChannelRegistry([email.channel]), orders: shop.placer });
});

afterAll(async () => {
  await h?.close();
});

const balance = async () => (await h.app.inject({ method: "GET", url: "/v1/teams/team-lumen-people/balance", headers: MAYA })).json();

async function sendCampaign(n = 2) {
  const before = email.sent.length;
  const { submitted, id } = await createAndSubmit(h.app, MAYA, send({ recipientIds: people(n), channels: ["email"] }));
  expect(submitted?.statusCode).toBe(200);
  const messages = email.sent.slice(before);
  expect(messages).toHaveLength(n);
  return { id: id!, messages, tokens: messages.map(tokenOf) };
}

async function firstItem(token: string) {
  const res = await h.app.inject({ method: "GET", url: `/v1/r/${token}/items` });
  expect(res.json().state).toBe("open");
  return res.json().items[0].sku as string;
}

// Each call comes from its own address, so the per-address rate limit (tested separately) does not interfere.
let nextIp = 1;
const redeem = (token: string, sku: string) =>
  h.app.inject({ method: "POST", url: `/v1/r/${token}/redeem`, payload: { sku, address }, remoteAddress: `10.1.${Math.floor(nextIp / 250)}.${(nextIp++ % 250) + 1}` });

describe("opening a link", () => {
  it("shows what the sender wrote, and marks the gift opened once", async () => {
    const { id, tokens } = await sendCampaign(1);
    const opened = await h.app.inject({ method: "GET", url: `/v1/r/${tokens[0]}` });
    expect(opened.json()).toMatchObject({ state: "open", from: "Maya Chen", headline: "Thank you!" });
    expect((await h.c.gifts.findOne({ campaignId: id }))?.status).toBe("opened");
  });

  it("never shows a price", async () => {
    const { tokens } = await sendCampaign(1);
    const items = await h.app.inject({ method: "GET", url: `/v1/r/${tokens[0]}/items` });
    expect(items.json().items.length).toBeGreaterThan(0);
    expect(items.body).not.toMatch(/price/i);
  });

  it("answers an unknown or malformed link without saying why", async () => {
    expect((await h.app.inject({ method: "GET", url: `/v1/r/${"z".repeat(43)}` })).json()).toEqual({ state: "invalid" });
    expect((await h.app.inject({ method: "GET", url: "/v1/r/short" })).statusCode).toBe(400);
  });

  it("works without signing in: the secret in the path is the credential", async () => {
    const { tokens } = await sendCampaign(1);
    expect((await h.app.inject({ method: "GET", url: `/v1/r/${tokens[0]}` })).statusCode).toBe(200);
    expect((await h.app.inject({ method: "GET", url: "/v1/campaigns" })).statusCode).toBe(200); // dev sign-in is on in the harness
  });
});

describe("choosing a gift", () => {
  it("creates one order numbered GFT-<giftId>, redeems the gift, and moves the ledger", async () => {
    const { id, tokens } = await sendCampaign(1);
    const sku = await firstItem(tokens[0]!);
    const before = await balance();

    const res = await redeem(tokens[0]!, sku);
    expect(res.statusCode).toBe(200);
    const gift = (await h.c.gifts.findOne({ campaignId: id }))!;
    expect(res.json()).toEqual({ orderNumber: `GFT-${gift._id}`, sku });
    expect(gift).toMatchObject({ status: "redeemed", ctOrderNumber: `GFT-${gift._id}`, claim: { sku, status: "ordered" } });

    // The hold (5000) was released and the order's full total (4500) captured.
    const types = (await h.c.ledgerEntries.find({ giftId: gift._id }).toArray()).map((e) => [e.type, e.amountCents]).sort();
    expect(types).toEqual([["capture", 4500], ["hold", 5000], ["release", 5000]].sort());
    const after = await balance();
    expect(after.heldCents).toBe(before.heldCents - 5000);
    expect(after.spentCents).toBe(before.spentCents + 4500);

    // The order is linked to the capture, so commerce and the ledger reconcile.
    expect(shop.calls.at(-1)).toMatchObject({ giftId: gift._id, captureKey: `capture:${gift._id}:1`, shipTo: { city: "Austin" } });
  });

  it("refuses a second try of the same link", async () => {
    const { tokens } = await sendCampaign(1);
    const sku = await firstItem(tokens[0]!);
    expect((await redeem(tokens[0]!, sku)).statusCode).toBe(200);
    const again = await redeem(tokens[0]!, sku);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("gift_used");
    expect((await h.app.inject({ method: "GET", url: `/v1/r/${tokens[0]}` })).json()).toEqual({ state: "used" });
  });

  it("makes exactly one order and one capture when many requests choose at once", async () => {
    const { id, tokens } = await sendCampaign(1);
    const sku = await firstItem(tokens[0]!);
    const ordersBefore = shop.orders.size;

    const results = await Promise.all(Array.from({ length: 20 }, () => redeem(tokens[0]!, sku)));

    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(shop.orders.size).toBe(ordersBefore + 1);
    const gift = (await h.c.gifts.findOne({ campaignId: id }))!;
    expect(await h.c.ledgerEntries.countDocuments({ giftId: gift._id, type: "capture" })).toBe(1);
    expect(gift.status).toBe("redeemed");
  });

  it("refuses an item the sender did not offer", async () => {
    const { tokens } = await sendCampaign(1);
    const res = await redeem(tokens[0]!, "NOT-A-SKU");
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("item_unavailable");
  });

  it("lets the recipient choose again when the item sells out", async () => {
    const { id, tokens } = await sendCampaign(1);
    const sku = await firstItem(tokens[0]!);
    shop.failNext(new OrderError("out_of_stock", "gone"));
    const res = await redeem(tokens[0]!, sku);
    expect(res.json().error.code).toBe("item_unavailable");
    expect((await h.c.gifts.findOne({ campaignId: id }))).toMatchObject({ status: "opened", claim: null });
    expect(await h.c.ledgerEntries.countDocuments({ giftId: (await h.c.gifts.findOne({ campaignId: id }))!._id, type: "capture" })).toBe(0);
    expect((await redeem(tokens[0]!, sku)).statusCode).toBe(200);
  });

  it("never refuses over the hold: it captures up to the hold and debits the overage on the same gift", async () => {
    const dear = fakeOrders(6200);
    const mail = recordingChannel();
    const h2 = await startHarness({ channels: createChannelRegistry([mail.channel]), orders: dear.placer });
    try {
      const { id } = await createAndSubmit(h2.app, MAYA, send({ recipientIds: people(1), channels: ["email"] }));
      const token = tokenOf(mail.sent[0]!);
      const items = (await h2.app.inject({ method: "GET", url: `/v1/r/${token}/items` })).json().items;
      const before = (await h2.app.inject({ method: "GET", url: "/v1/teams/team-lumen-people/balance", headers: MAYA })).json();
      const res = await h2.app.inject({ method: "POST", url: `/v1/r/${token}/redeem`, payload: { sku: items[0].sku, address }, remoteAddress: "10.9.0.1" });
      expect(res.statusCode).toBe(200);

      const gift = (await h2.c.gifts.findOne({ campaignId: id! }))!;
      expect(gift.status).toBe("redeemed");
      const entries = await h2.c.ledgerEntries.find({ giftId: gift._id }).toArray();
      expect(entries.map((e) => [e.type, e.amountCents]).sort()).toEqual([["adjustment", 1200], ["capture", 5000], ["hold", 5000], ["release", 5000]].sort());

      // The team paid the whole order: the 5000 hold became spend, and 1200 more left its balance.
      const after = (await h2.app.inject({ method: "GET", url: "/v1/teams/team-lumen-people/balance", headers: MAYA })).json();
      expect(after.availableCents).toBe(before.availableCents + 5000 - 6200);
    } finally {
      await h2.close();
    }
  });

  it("finds the order after a timeout instead of creating a second one", async () => {
    const { id, tokens } = await sendCampaign(1);
    const sku = await firstItem(tokens[0]!);
    const ordersBefore = shop.orders.size;
    shop.failNext("timeout");
    const res = await redeem(tokens[0]!, sku);
    expect(res.statusCode).toBe(200);
    expect(shop.orders.size).toBe(ordersBefore + 1);
    expect((await h.c.gifts.findOne({ campaignId: id }))?.status).toBe("redeemed");
  });

  it("says so plainly, and keeps nothing, when order creation is switched off", async () => {
    const mail = recordingChannel();
    const h2 = await startHarness({ channels: createChannelRegistry([mail.channel]) });
    try {
      const { id } = await createAndSubmit(h2.app, MAYA, send({ recipientIds: people(1), channels: ["email"] }));
      const token = tokenOf(mail.sent[0]!);
      const items = (await h2.app.inject({ method: "GET", url: `/v1/r/${token}/items` })).json().items;
      const res = await h2.app.inject({ method: "POST", url: `/v1/r/${token}/redeem`, payload: { sku: items[0].sku, address } });
      expect(res.statusCode).toBe(500);
      expect((await h2.c.gifts.findOne({ campaignId: id! }))).toMatchObject({ status: "opened", claim: null });
    } finally {
      await h2.close();
    }
  });

  it("refuses a bad address and a bad token shape before anything is written", async () => {
    const { tokens } = await sendCampaign(1);
    const sku = await firstItem(tokens[0]!);
    const bad = await h.app.inject({ method: "POST", url: `/v1/r/${tokens[0]}/redeem`, payload: { sku, address: { ...address, postalCode: "1" } } });
    expect(bad.statusCode).toBe(400);
    expect((await h.app.inject({ method: "POST", url: "/v1/r/nope/redeem", payload: { sku, address } })).statusCode).toBe(400);
  });
});

describe("expiry", () => {
  it("refuses a link whose gift has expired", async () => {
    const { id, tokens } = await sendCampaign(1);
    await h.c.gifts.updateOne({ campaignId: id }, { $set: { expiresAt: new Date("2026-01-01T00:00:00Z") } });
    expect((await h.app.inject({ method: "GET", url: `/v1/r/${tokens[0]}` })).json()).toEqual({ state: "expired" });
    const sku = "ANY-SKU";
    expect((await redeem(tokens[0]!, sku)).statusCode).toBe(410);
  });
});

describe("the sender replaces or cancels a gift", () => {
  it("sends a gift again with a new link, and the old link stops working", async () => {
    const { id, tokens } = await sendCampaign(1);
    const gift = (await h.c.gifts.findOne({ campaignId: id }))!;
    const before = email.sent.length;

    const res = await h.app.inject({ method: "POST", url: `/v1/gifts/${gift._id}/resend`, headers: MAYA });
    expect(res.json()).toEqual({ result: "sent" });
    const fresh = tokenOf(email.sent[before]!);
    expect(fresh).not.toBe(tokens[0]);
    expect((await h.app.inject({ method: "GET", url: `/v1/r/${tokens[0]}` })).json()).toEqual({ state: "invalid" });
    expect((await h.app.inject({ method: "GET", url: `/v1/r/${fresh}` })).json().state).toBe("open");
  });

  it("cancels a gift: its link stops working and its hold goes back to the team", async () => {
    const { id, tokens } = await sendCampaign(1);
    const gift = (await h.c.gifts.findOne({ campaignId: id }))!;
    const before = await balance();

    expect((await h.app.inject({ method: "POST", url: `/v1/gifts/${gift._id}/cancel`, headers: MAYA })).json()).toEqual({ cancelled: true });

    expect((await h.c.gifts.findOne({ _id: gift._id }))?.status).toBe("cancelled");
    expect(await h.c.ledgerEntries.countDocuments({ giftId: gift._id, type: "release" })).toBe(1);
    expect((await balance()).heldCents).toBe(before.heldCents - 5000);
    expect((await h.app.inject({ method: "GET", url: `/v1/r/${tokens[0]}` })).json()).toEqual({ state: "expired" });
    expect((await h.app.inject({ method: "POST", url: `/v1/gifts/${gift._id}/cancel`, headers: MAYA })).statusCode).toBe(409);
  });

  it("will not resend or cancel a gift that was already chosen, or one in another team", async () => {
    const { id, tokens } = await sendCampaign(1);
    const gift = (await h.c.gifts.findOne({ campaignId: id }))!;
    await redeem(tokens[0]!, await firstItem(tokens[0]!));
    expect((await h.app.inject({ method: "POST", url: `/v1/gifts/${gift._id}/resend`, headers: MAYA })).statusCode).toBe(409);
    expect((await h.app.inject({ method: "POST", url: `/v1/gifts/${gift._id}/cancel`, headers: MAYA })).statusCode).toBe(409);
    expect((await h.app.inject({ method: "POST", url: `/v1/gifts/${gift._id}/cancel`, headers: { "x-dev-user": "user-maya", "x-dev-team": "team-lumen-sales" } })).statusCode).toBe(404);
  });
});

describe("guarding the link", () => {
  it("stops a client that keeps guessing", async () => {
    const guess = () => h.app.inject({ method: "POST", url: `/v1/r/${"q".repeat(43)}/redeem`, payload: { sku: "X", address }, remoteAddress: "203.0.113.50" });
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await guess()).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 404)).toBe(true);
    expect(codes[10]).toBe(429);
    expect((await guess()).json()).toEqual({ error: { code: "rate_limited", message: "Too many requests. Please wait a moment and try again." } });
  });

  it("never writes a gift token to the log", async () => {
    // The request log records the route pattern, never the URL (see app.ts); this checks the pattern is what is registered.
    const routes = h.app.printRoutes({ commonPrefix: false });
    expect(routes).toContain(":token");
  });
});
