import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAndSubmit, type Harness, MAYA_SALES, startHarness } from "./harness";

// A team that exists in the commerce platform but was never funded has no budget account.
let h: Harness;

beforeAll(async () => {
  h = await startHarness();
  await h.c.accounts.deleteOne({ teamKey: "team-lumen-sales" });
});

afterAll(async () => {
  await h?.close();
});

describe("a team with no budget account yet", () => {
  it("reads as an empty balance, so Home and the balance load", async () => {
    const balance = await h.app.inject({ method: "GET", url: "/v1/teams/team-lumen-sales/balance", headers: MAYA_SALES });
    expect(balance.statusCode).toBe(200);
    expect(balance.json()).toMatchObject({ teamKey: "team-lumen-sales", availableCents: 0, heldCents: 0, spentCents: 0 });
    const overview = await h.app.inject({ method: "GET", url: "/v1/teams/team-lumen-sales/overview?range=30d", headers: MAYA_SALES });
    expect(overview.statusCode).toBe(200);
  });

  it("refuses a send for lack of funds and writes nothing", async () => {
    const { submitted } = await createAndSubmit(h.app, MAYA_SALES);
    expect([submitted?.statusCode, submitted?.json().error.code]).toEqual([409, "insufficient_funds"]);
    expect(await h.c.gifts.countDocuments({ teamKey: "team-lumen-sales" })).toBe(0);
    expect(await h.c.ledgerEntries.countDocuments({ teamKey: "team-lumen-sales" })).toBe(0);
  });
});
