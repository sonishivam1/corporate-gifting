import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "./app";
import { defaultDeps } from "./deps";

// None of these reach the database: the requests are refused or answered first.
let app: FastifyInstance;
let signedOut: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ deps: defaultDeps({ DEV_AUTH: "1" }) });
  signedOut = await buildApp({ deps: defaultDeps({ DEV_AUTH: "1", NODE_ENV: "production" }) });
});

afterAll(async () => {
  await app.close();
  await signedOut.close();
});

const asUser = (user: string, team?: string) => ({ "x-dev-user": user, ...(team ? { "x-dev-team": team } : {}) });

describe("development sign-in", () => {
  it("is never on in production", async () => {
    const res = await signedOut.inject({ method: "GET", url: "/v1/workspace" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("unauthenticated");
  });

  it("never stands in for real sign-in: account routes ignore the development headers", async () => {
    // No accounts service in this app: account routes say sign-in isn't configured, whatever the headers say.
    const res = await app.inject({ method: "GET", url: "/v1/me", headers: asUser("user-maya") });
    expect([res.statusCode, res.json().error.code]).toEqual([503, "auth_not_configured"]);
    const options = await signedOut.inject({ method: "GET", url: "/v1/auth/options" });
    expect(options.json().error.code).toBe("auth_not_configured");
  });

  it("still serves /health and /v1/meta without a session", async () => {
    expect((await signedOut.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    expect((await signedOut.inject({ method: "GET", url: "/v1/meta" })).statusCode).toBe(200);
  });

  it("defaults to the demo sender in their first team", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/workspace" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      user: { id: "user-maya", role: "sender" },
      company: { key: "company-lumen-labs" },
      team: { key: "team-lumen-people", approverNames: ["Rowan Ellis"] },
    });
    expect(res.json().teams).toHaveLength(2);
  });

  it("switches team only to one the user belongs to", async () => {
    const sales = await app.inject({ method: "GET", url: "/v1/workspace", headers: asUser("user-maya", "team-lumen-sales") });
    expect(sales.json().team.key).toBe("team-lumen-sales");
    const notMine = await app.inject({ method: "GET", url: "/v1/workspace", headers: asUser("user-rowan", "team-lumen-sales") });
    expect(notMine.json().team.key).toBe("team-lumen-people");
  });

  it("refuses an unknown user", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/workspace", headers: asUser("user-nobody") });
    expect(res.statusCode).toBe(401);
  });
});

describe("scope", () => {
  it("treats another team's balance as not found", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/teams/team-lumen-sales/balance" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
  });
});

describe("send input", () => {
  const valid = {
    gift: { kind: "collection", collectionId: "col-treats", budgetCents: 5000 },
    greeting: { occasion: "thanks", cover: "confetti", headline: "Thank you!", fromName: "Maya Chen" },
    message: "Thanks for everything.",
    recipientIds: ["rcp-lumen-01"],
    channels: ["email"],
    sendAt: null,
    expiresInDays: 60,
    reminders: true,
  };

  it("refuses a fractional budget", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/campaigns/estimate",
      payload: { ...valid, gift: { ...valid.gift, budgetCents: 49.99 } },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses an expiry that isn't offered", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/campaigns/estimate", payload: { ...valid, expiresInDays: 45 } });
    expect(res.statusCode).toBe(400);
  });

  it("refuses repeated channels and no channels", async () => {
    for (const channels of [[], ["email", "email"]]) {
      const res = await app.inject({ method: "POST", url: "/v1/campaigns/estimate", payload: { ...valid, channels } });
      expect(res.statusCode, JSON.stringify(channels)).toBe(400);
    }
  });

  it("refuses an idempotency key that isn't a UUID", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/campaigns",
      headers: { "idempotency-key": "again" },
      payload: valid,
    });
    expect(res.statusCode).toBe(400);
  });
});
