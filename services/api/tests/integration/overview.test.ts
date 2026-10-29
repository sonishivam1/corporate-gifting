// The Home overview against a real database: its numbers match the gifts,
// and every status change writes the date the chart counts by.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAndSubmit, type Harness, MAYA, NOW, people, ROWAN, send, startHarness } from "./harness";

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});

afterAll(async () => {
  await h?.close();
});

const overview = async (range = "30d") =>
  (await h.app.inject({ method: "GET", url: `/v1/teams/team-lumen-people/overview?range=${range}`, headers: MAYA })).json();

describe("the Home overview", () => {
  it("starts empty, with the team's balance", async () => {
    const o = await overview();
    expect(o).toMatchObject({ sent: { count: 0, previous: 0 }, chose: { count: 0, rate: 0 }, expiringSoon: 0, pendingApprovals: 0 });
    expect(o.daily).toHaveLength(30);
    expect(o.balance.availableCents).toBeGreaterThan(0);
  });

  it("counts a sent campaign's gifts, and dates them when they went out", async () => {
    const before = await overview();
    const { id } = await createAndSubmit(h.app, MAYA, send({ recipientIds: people(3) }));
    const gifts = await h.c.gifts.find({ campaignId: id! }).toArray();
    expect(gifts.map((g) => g.statusAt?.sent?.toISOString())).toEqual(Array(3).fill(NOW.toISOString()));

    const o = await overview("7d");
    expect(o.sent.count).toBe(before.sent.count + 3);
    expect(o.statuses.waiting).toBe(3);
    expect(o.daily.at(-1)).toMatchObject({ date: NOW.toISOString().slice(0, 10), sent: 3 });
    expect(o.balance.heldCents).toBeGreaterThan(before.balance.heldCents);
  });

  it("shows a send waiting for approval, and counts its gifts only once approved", async () => {
    const big = send({ recipientIds: people(16), gift: { kind: "collection", collectionId: "col-holiday", budgetCents: 7500 } });
    const { id } = await createAndSubmit(h.app, MAYA, big);
    const waiting = await overview();
    expect(waiting.pendingApprovals).toBe(1);

    await h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/approve`, headers: ROWAN });
    const approved = await overview();
    expect(approved.pendingApprovals).toBe(0);
    expect(approved.sent.count).toBe(waiting.sent.count + 16);
    const gifts = await h.c.gifts.find({ campaignId: id! }).toArray();
    expect(gifts.every((g) => g.statusAt?.pending_approval && g.statusAt?.sent)).toBe(true);
  });
});
