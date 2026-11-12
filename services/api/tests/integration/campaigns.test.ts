import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAndSubmit,
  DANA,
  DANA_SALES,
  type Harness,
  IMANI,
  MAYA,
  MAYA_SALES,
  NOW,
  people,
  ROWAN,
  send,
  startHarness,
  THEO,
} from "./harness";

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});

afterAll(async () => {
  await h?.close();
});

const balance = async (headers: Record<string, string>, team: string) =>
  (await h.app.inject({ method: "GET", url: `/v1/teams/${team}/balance`, headers })).json();

const holdsFor = (campaignId: string) => h.c.ledgerEntries.countDocuments({ campaignId, type: "hold" });

describe("sending without approval", () => {
  it("estimates without saving anything", async () => {
    const res = await h.app.inject({ method: "POST", url: "/v1/campaigns/estimate", headers: MAYA, payload: send() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ gifts: 3, holdCents: 5000, totalCents: 15_000, needsApproval: false, short: false });
    expect(await h.c.campaigns.countDocuments()).toBe(0);
  });

  it("creates the gifts and holds their budget in one go", async () => {
    const before = await balance(MAYA, "team-lumen-people");
    const { submitted, id } = await createAndSubmit(h.app, MAYA);
    expect(submitted?.statusCode).toBe(200);
    expect(submitted?.json()).toMatchObject({ outcome: "sent", gifts: 3, totalCents: 15_000, links: [] });

    const gifts = await h.c.gifts.find({ campaignId: id! }).toArray();
    expect(gifts.map((g) => g.status)).toEqual(["sent", "sent", "sent"]);
    expect(gifts.every((g) => g.holdNo === 1 && g.notifications[0]?.status === "queued")).toBe(true);
    expect(await holdsFor(id!)).toBe(3);

    const after = await balance(MAYA, "team-lumen-people");
    expect(after.heldCents - before.heldCents).toBe(15_000);
    expect(before.availableCents - after.availableCents).toBe(15_000);
  });

  it("returns gift links once and stores only their hashes", async () => {
    const { submitted, id } = await createAndSubmit(h.app, MAYA, send({ channels: ["link", "qr"] }));
    const links = submitted!.json().links as { url: string }[];
    expect(links).toHaveLength(3);
    const token = links[0]!.url.split("/r/")[1]!;
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    const stored = JSON.stringify(await h.c.gifts.find({ campaignId: id! }).toArray());
    expect(stored).not.toContain(token);
  });

  it("changes nothing on a second submit", async () => {
    const { id } = await createAndSubmit(h.app, MAYA);
    const again = await h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/submit`, headers: MAYA });
    expect(again.statusCode).toBe(200);
    expect(again.json().links).toEqual([]);
    expect(await h.c.gifts.countDocuments({ campaignId: id! })).toBe(3);
    expect(await holdsFor(id!)).toBe(3);
  });

  it("creates one gift set when two submits race", async () => {
    const created = await h.app.inject({ method: "POST", url: "/v1/campaigns", headers: MAYA, payload: send() });
    const id = created.json().id as string;
    const results = await Promise.all(
      [1, 2, 3].map(() => h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/submit`, headers: MAYA })),
    );
    expect(results.every((r) => r.statusCode === 200 || r.statusCode === 409)).toBe(true);
    expect(await h.c.gifts.countDocuments({ campaignId: id })).toBe(3);
    expect(await holdsFor(id)).toBe(3);
  });

  it("returns the same campaign for a repeated idempotency key", async () => {
    const key = randomUUID();
    const headers = { ...MAYA, "idempotency-key": key };
    const first = await h.app.inject({ method: "POST", url: "/v1/campaigns", headers, payload: send() });
    const second = await h.app.inject({ method: "POST", url: "/v1/campaigns", headers, payload: send() });
    expect(first.json().id).toBe(key);
    expect(second.json().id).toBe(key);
    expect(await h.c.campaigns.countDocuments({ _id: key })).toBe(1);
  });

  it("schedules a later send: holds now, gifts wait for the date", async () => {
    const { submitted, id } = await createAndSubmit(h.app, MAYA, send({ sendAt: "2026-11-03" }));
    expect(submitted?.json().outcome).toBe("scheduled");
    const campaign = await h.c.campaigns.findOne({ _id: id! });
    expect(campaign?.status).toBe("approved");
    expect(campaign?.type).toBe("scheduled");
    expect((await h.c.gifts.find({ campaignId: id! }).toArray()).every((g) => g.status === "scheduled")).toBe(true);
    expect(await holdsFor(id!)).toBe(3);
  });

  it("refuses a send date of today or earlier", async () => {
    const res = await h.app.inject({ method: "POST", url: "/v1/campaigns", headers: MAYA, payload: send({ sendAt: "2026-10-28" }) });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("invalid_send_date");
  });

  it("adds a new address to the directory once", async () => {
    const body = send({ recipientIds: [people(1)[0]], newEmails: ["new.starter@lumenlabs.example", "New.Starter@lumenlabs.example"] });
    const { submitted } = await createAndSubmit(h.app, MAYA, body);
    expect(submitted?.json().gifts).toBe(2);
    expect(await h.c.recipients.countDocuments({ emailLower: "new.starter@lumenlabs.example" })).toBe(1);
  });
});

describe("prices come from the catalog", () => {
  it("holds the product's price for a single gift", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: "/v1/campaigns/estimate",
      headers: MAYA,
      payload: send({ gift: { kind: "single", sku: "BL-TEA-SAMPLER", priceCents: 1 } }),
    });
    expect(res.json().holdCents).toBe(2400);
  });

  it("refuses an unknown product", async () => {
    const res = await h.app.inject({ method: "POST", url: "/v1/campaigns", headers: MAYA, payload: send({ gift: { kind: "single", sku: "NOPE" } }) });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("item_not_eligible");
  });

  it("refuses a collection with nothing under the budget", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: "/v1/campaigns",
      headers: MAYA,
      payload: send({ gift: { kind: "collection", collectionId: "col-outdoor", budgetCents: 1000 } }),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("collection_empty");
  });

  it("refuses someone who isn't in the company's directory", async () => {
    const res = await h.app.inject({ method: "POST", url: "/v1/campaigns", headers: MAYA, payload: send({ recipientIds: ["rcp-other-company"] }) });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("unknown_recipient");
  });
});

describe("approval", () => {
  // People approves above $1,000: 16 gifts × $75 = $1,200.
  const big = () => send({ recipientIds: people(16), gift: { kind: "collection", collectionId: "col-holiday", budgetCents: 7500 } });

  it("waits for an approver and holds nothing", async () => {
    const { submitted, id } = await createAndSubmit(h.app, MAYA, big());
    expect(submitted?.json()).toMatchObject({ outcome: "pending_approval", gifts: 16 });
    expect((await h.c.gifts.find({ campaignId: id! }).toArray()).every((g) => g.status === "pending_approval" && g.holdNo === 0)).toBe(true);
    expect(await holdsFor(id!)).toBe(0);
  });

  it("refuses a sender or an admin: their roles can't approve", async () => {
    const { id } = await createAndSubmit(h.app, MAYA, big());
    for (const headers of [MAYA, THEO]) {
      const res = await h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/approve`, headers });
      expect([res.statusCode, res.json().error.code]).toEqual([403, "forbidden"]);
    }
    expect(await holdsFor(id!)).toBe(0);
  });

  it("refuses an approver sending: their role can't create campaigns", async () => {
    const res = await h.app.inject({ method: "POST", url: "/v1/campaigns", headers: ROWAN, payload: big() });
    expect([res.statusCode, res.json().error.code]).toEqual([403, "forbidden"]);
  });

  it("refuses an owner approving their own campaign", async () => {
    const { id } = await createAndSubmit(h.app, DANA, big());
    const res = await h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/approve`, headers: DANA });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("self_approval");
    expect(await holdsFor(id!)).toBe(0);
  });

  it("lets the owner approve with no team role, inside the team they chose", async () => {
    const { id } = await createAndSubmit(h.app, MAYA, big());
    // Working in Sales, People's campaign is out of scope.
    expect((await h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/approve`, headers: DANA_SALES })).statusCode).toBe(404);
    const detail = await h.app.inject({ method: "GET", url: `/v1/campaigns/${id}`, headers: DANA });
    expect(detail.json()).toMatchObject({ canDecide: true });
    expect(detail.json().approval.approverNames).toEqual(["Rowan Ellis", "Dana Okafor"]);
    const res = await h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/approve`, headers: DANA });
    expect(res.statusCode).toBe(200);
    expect((await h.c.campaigns.findOne({ _id: id! }))?.approval).toMatchObject({ approverId: "user-dana", decision: "approved" });
  });

  it("treats another team's approver as not found", async () => {
    const { id } = await createAndSubmit(h.app, MAYA, big());
    const res = await h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/approve`, headers: IMANI });
    expect(res.statusCode).toBe(404);
    expect(await holdsFor(id!)).toBe(0);
  });

  it("places the holds and sends the gifts once approved, once", async () => {
    const { id } = await createAndSubmit(h.app, MAYA, big());
    const detail = await h.app.inject({ method: "GET", url: `/v1/campaigns/${id}`, headers: ROWAN });
    expect(detail.json()).toMatchObject({ canDecide: true, totalHoldCents: 120_000, displayStatus: "pending_approval" });

    const approved = await h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/approve`, headers: ROWAN });
    expect(approved.json()).toEqual({ campaignId: id, status: "active" });
    expect((await h.c.gifts.find({ campaignId: id! }).toArray()).every((g) => g.status === "sent" && g.holdNo === 1)).toBe(true);
    expect(await holdsFor(id!)).toBe(16);
    expect((await h.c.campaigns.findOne({ _id: id! }))?.approval).toMatchObject({ approverId: "user-rowan", decision: "approved" });

    const again = await h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/approve`, headers: ROWAN });
    expect(again.statusCode).toBe(409);
    expect(await holdsFor(id!)).toBe(16);
  });

  it("cancels every gift when declined", async () => {
    const { id } = await createAndSubmit(h.app, MAYA, big());
    const res = await h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/decline`, headers: ROWAN });
    expect(res.json().status).toBe("cancelled");
    expect((await h.c.gifts.find({ campaignId: id! }).toArray()).every((g) => g.status === "cancelled")).toBe(true);
    expect(await holdsFor(id!)).toBe(0);
  });
});

describe("money", () => {
  it("refuses a send the team can't cover and writes nothing", async () => {
    // Bring Sales down to $100 available with a debit adjustment.
    const account = await h.c.accounts.findOne({ teamKey: "team-lumen-sales" });
    await h.c.ledgerEntries.insertOne({
      _id: randomUUID(),
      accountId: account!._id,
      type: "adjustment",
      direction: "debit",
      amountCents: 790_000,
      currency: "USD",
      giftId: null,
      campaignId: null,
      idempotencyKey: "adjustment:test-drain-sales",
      reason: "Test: drain the balance",
      createdAt: NOW,
      createdBy: "test",
    });
    const entriesBefore = await h.c.ledgerEntries.countDocuments();

    const estimate = await h.app.inject({ method: "POST", url: "/v1/campaigns/estimate", headers: MAYA_SALES, payload: send() });
    expect(estimate.json()).toMatchObject({ short: true, shortByCents: 5000 });

    const { submitted, id } = await createAndSubmit(h.app, MAYA_SALES);
    expect(submitted?.statusCode).toBe(409);
    expect(submitted?.json().error.code).toBe("insufficient_funds");
    expect(await h.c.gifts.countDocuments({ campaignId: id! })).toBe(0);
    expect(await h.c.ledgerEntries.countDocuments()).toBe(entriesBefore);
    expect((await h.c.campaigns.findOne({ _id: id! }))?.status).toBe("draft");
  });

  it("lets only one of two racing sends spend the last of the budget", async () => {
    // Sales now has $100: each of these holds $100.
    const body = send({ recipientIds: people(2) });
    const drafts = await Promise.all(
      [1, 2].map(async () => (await h.app.inject({ method: "POST", url: "/v1/campaigns", headers: MAYA_SALES, payload: body })).json().id as string),
    );
    const results = await Promise.all(
      drafts.map((id) => h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/submit`, headers: MAYA_SALES })),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect((await balance(MAYA_SALES, "team-lumen-sales")).availableCents).toBe(0);
  });
});

describe("scope", () => {
  it("treats another team's campaign as not found", async () => {
    const { id } = await createAndSubmit(h.app, MAYA);
    for (const url of [`/v1/campaigns/${id}`, `/v1/campaigns/${id}/gifts`]) {
      const res = await h.app.inject({ method: "GET", url, headers: MAYA_SALES });
      expect(res.statusCode, url).toBe(404);
    }
    const submit = await h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/submit`, headers: MAYA_SALES });
    expect(submit.statusCode).toBe(404);
  });

  it("treats another company's campaign as not found", async () => {
    const { id } = await createAndSubmit(h.app, MAYA);
    const theirs = await h.c.campaigns.findOne({ _id: id! });
    await h.c.campaigns.insertOne({ ...theirs!, _id: "cmp-other-company", companyKey: "company-orbit-fieldworks" });
    const res = await h.app.inject({ method: "GET", url: "/v1/campaigns/cmp-other-company", headers: MAYA });
    expect(res.statusCode).toBe(404);
  });

  it("ignores a team or price sent in the body", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: "/v1/campaigns",
      headers: MAYA,
      payload: { ...send(), teamKey: "team-lumen-sales", companyKey: "company-orbit-fieldworks" },
    });
    const campaign = await h.c.campaigns.findOne({ _id: res.json().id });
    expect(campaign).toMatchObject({ teamKey: "team-lumen-people", companyKey: "company-lumen-labs", budgetCents: 5000 });
  });
});

describe("lists", () => {
  it("shows the team's campaigns with counts and a funnel, without drafts", async () => {
    const res = await h.app.inject({ method: "GET", url: "/v1/campaigns", headers: MAYA });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.campaigns.every((c: { status: string }) => c.status !== "draft")).toBe(true);
    expect(body.counts.pending_approval).toBeGreaterThan(0);
    expect(body.counts.scheduled).toBeGreaterThan(0);
    expect(body.funnel.sent).toBeGreaterThan(0);

    const pending = await h.app.inject({ method: "GET", url: "/v1/campaigns?status=pending_approval", headers: MAYA });
    expect(pending.json().campaigns.every((c: { status: string }) => c.status === "pending_approval")).toBe(true);
  });

  it("lists collections with what fits the budget", async () => {
    const res = await h.app.inject({ method: "GET", url: "/v1/collections?budget=2500", headers: MAYA });
    const treats = res.json().collections.find((c: { id: string }) => c.id === "col-treats");
    expect(treats.itemCount).toBe(1);
  });

  it("filters products by budget, occasion and category", async () => {
    const res = await h.app.inject({ method: "GET", url: "/v1/catalog/products?budget=3000&category=drink&occasion=thanks", headers: MAYA });
    expect(res.json().products.map((p: { sku: string }) => p.sku)).toEqual(["BL-TEA-SAMPLER", "BL-MUG-PAIR"]);
  });

  it("searches the directory", async () => {
    const res = await h.app.inject({ method: "GET", url: "/v1/recipients?q=rivera", headers: MAYA });
    expect(res.json().recipients).toEqual([{ id: "rcp-lumen-01", name: "Jordan Rivera", email: "jordan.rivera@lumenlabs.example" }]);
  });
});

// Last: it drains the People budget.
describe("approval when the budget has run down", () => {
  it("refuses to approve and changes nothing", async () => {
    // 16 × $75 = $1,200: over People's $1,000 threshold, so it waits for Rowan.
    const body = send({ recipientIds: people(16), gift: { kind: "collection", collectionId: "col-holiday", budgetCents: 7500 } });
    const { submitted, id } = await createAndSubmit(h.app, MAYA, body);
    expect(submitted?.json().outcome).toBe("pending_approval");

    // Meanwhile the team spends down to $1,000 available.
    const { availableCents } = await balance(MAYA, "team-lumen-people");
    const account = await h.c.accounts.findOne({ teamKey: "team-lumen-people" });
    await h.c.ledgerEntries.insertOne({
      _id: randomUUID(),
      accountId: account!._id,
      type: "adjustment",
      direction: "debit",
      amountCents: availableCents - 100_000,
      currency: "USD",
      giftId: null,
      campaignId: null,
      idempotencyKey: "adjustment:test-drain-people",
      reason: "Test: spend down the balance",
      createdAt: NOW,
      createdBy: "test",
    });

    const res = await h.app.inject({ method: "POST", url: `/v1/campaigns/${id}/approve`, headers: ROWAN });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("insufficient_funds");
    expect((await h.c.campaigns.findOne({ _id: id! }))?.status).toBe("pending_approval");
    expect((await h.c.gifts.find({ campaignId: id! }).toArray()).every((g) => g.status === "pending_approval" && g.holdNo === 0)).toBe(true);
    expect(await holdsFor(id!)).toBe(0);
  });
});
