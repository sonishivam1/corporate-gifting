import { createChannelRegistry } from "@gifting/channels";
import { describe, expect, it } from "vitest";

import { address, fakeOrders, recordingChannel, tokenOf } from "./fakes";
import { createAndSubmit, MAYA, people, send, startHarness } from "./harness";

describe("the estimate for shipping and tax", () => {
  it("holds the budget plus the configured estimate for shipping and tax, shows it, and releases the rest at redemption", async () => {
    const mail = recordingChannel();
    const orders = fakeOrders(5631);
    const h2 = await startHarness({ channels: createChannelRegistry([mail.channel]), orders: orders.placer, giftEstimatePercent: 25 });
    try {
      const est = await h2.app.inject({ method: "POST", url: "/v1/campaigns/estimate", headers: MAYA, payload: send({ recipientIds: people(2) }) });
      expect(est.json()).toMatchObject({ gifts: 2, holdCents: 6250, estimateCents: 1250, totalCents: 12_500 });

      const { id } = await createAndSubmit(h2.app, MAYA, send({ recipientIds: people(1), channels: ["email"] }));
      const gift = (await h2.c.gifts.findOne({ campaignId: id! }))!;
      expect(gift.holdCents).toBe(6250);

      const token = tokenOf(mail.sent[0]!);
      const items = (await h2.app.inject({ method: "GET", url: `/v1/r/${token}/items` })).json().items;
      const res = await h2.app.inject({ method: "POST", url: `/v1/r/${token}/redeem`, payload: { sku: items[0].sku, address }, remoteAddress: "10.9.0.2" });
      expect(res.statusCode).toBe(200);
      const entries = await h2.c.ledgerEntries.find({ giftId: gift._id }).toArray();
      // Real cost captured; the unused part of the estimate is released back.
      expect(entries.map((e) => [e.type, e.amountCents]).sort()).toEqual([["capture", 5631], ["hold", 6250], ["release", 6250]].sort());
    } finally {
      await h2.close();
    }
  });
});
