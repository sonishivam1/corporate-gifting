import { createChannelRegistry } from "@gifting/channels";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordingChannel, tokenOf } from "./fakes";
import { createAndSubmit, type Harness, MAYA, people, send, startHarness } from "./harness";

let h: Harness;
const email = recordingChannel();

beforeAll(async () => {
  h = await startHarness({ channels: createChannelRegistry([email.channel]) });
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

describe("delivery after a campaign is sent", () => {
  it("emails each recipient their own private link, and stores only its hash", async () => {
    const { id, messages, tokens } = await sendCampaign(2);
    expect(new Set(tokens).size).toBe(2);
    expect(messages[0]).toMatchObject({ senderName: "Maya Chen", greeting: "Thank you!", link: expect.stringMatching(/^http:\/\/gifts\.test\/r\//) });

    const gifts = await h.c.gifts.find({ campaignId: id }).toArray();
    for (const gift of gifts) {
      expect(gift.notifications[0]).toMatchObject({ kind: "send", status: "sent", providerMessageId: expect.stringContaining("msg-") });
    }
    // No raw token is stored anywhere on the document.
    for (const token of tokens) expect(JSON.stringify(gifts)).not.toContain(token);
  });

  it("leaves a gift retryable when its email fails, and the sender can send it again", async () => {
    email.failNext();
    const before = email.sent.length;
    const { id } = await createAndSubmit(h.app, MAYA, send({ recipientIds: people(1), channels: ["email"] }));
    expect(email.sent.length).toBe(before); // the one email failed
    const gift = (await h.c.gifts.find({ campaignId: id! }).toArray())[0]!;
    expect(gift.notifications[0]?.status).toBe("failed");

    // A failed message is not retried by itself; the sender resends, which queues a new one with a new link.
    const resent = await h.app.inject({ method: "POST", url: `/v1/gifts/${gift._id}/resend`, headers: MAYA });
    expect(resent.json()).toEqual({ result: "sent" });
    expect(email.sent.length).toBe(before + 1);
  });
});


describe("the sender sends again or cancels", () => {
  it("sends a gift again with a new link, and the stored hash changes", async () => {
    const { id, tokens } = await sendCampaign(1);
    const before = (await h.c.gifts.findOne({ campaignId: id }))!;
    const mails = email.sent.length;

    const res = await h.app.inject({ method: "POST", url: `/v1/gifts/${before._id}/resend`, headers: MAYA });
    expect(res.json()).toEqual({ result: "sent" });
    expect(tokenOf(email.sent[mails]!)).not.toBe(tokens[0]);
    expect((await h.c.gifts.findOne({ _id: before._id }))!.tokenHash).not.toBe(before.tokenHash);
  });

  it("cancels a gift and gives its hold back to the team", async () => {
    const { id } = await sendCampaign(1);
    const gift = (await h.c.gifts.findOne({ campaignId: id }))!;
    const before = await balance();

    expect((await h.app.inject({ method: "POST", url: `/v1/gifts/${gift._id}/cancel`, headers: MAYA })).json()).toEqual({ cancelled: true });

    // The Home overview reads when each status was reached.
    expect(await h.c.gifts.findOne({ _id: gift._id })).toMatchObject({ status: "cancelled", statusAt: { cancelled: expect.any(Date) } });
    expect(await h.c.ledgerEntries.countDocuments({ giftId: gift._id, type: "release" })).toBe(1);
    expect((await balance()).heldCents).toBe(before.heldCents - gift.holdCents);
    expect((await h.app.inject({ method: "POST", url: `/v1/gifts/${gift._id}/cancel`, headers: MAYA })).statusCode).toBe(409);
  });

  it("will not touch a gift in another team", async () => {
    const { id } = await sendCampaign(1);
    const gift = (await h.c.gifts.findOne({ campaignId: id }))!;
    const other = { "x-dev-user": "user-maya", "x-dev-team": "team-lumen-sales" };
    expect((await h.app.inject({ method: "POST", url: `/v1/gifts/${gift._id}/cancel`, headers: other })).statusCode).toBe(404);
    expect((await h.app.inject({ method: "POST", url: `/v1/gifts/${gift._id}/resend`, headers: other })).statusCode).toBe(404);
  });
});
