import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { buildApp } from "./app";
import { defaultDeps } from "./deps";
import { ApiError } from "./http/errors";
import { defineRoute, registerRoutes } from "./http/route";

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  // Signed in, so the error-shape routes below get past the session check.
  app = await buildApp({ deps: defaultDeps({ DEV_AUTH: "1" }) });
  // Test-only routes that exercise the error shape.
  registerRoutes(app, [
    defineRoute({
      method: "POST",
      url: "/v1/test/echo",
      auth: "public",
      schema: { body: z.object({ amountCents: z.number().int() }), response: z.object({ amountCents: z.number() }) },
      handler: async ({ body }) => {
        const withInternalField = { amountCents: body.amountCents, internal: "never leaves" };
        return withInternalField;
      },
    }),
    defineRoute({
      method: "GET",
      url: "/v1/test/gift",
      auth: "public",
      schema: {},
      handler: async () => {
        throw new ApiError(404, "gift_not_found", "Gift not found.");
      },
    }),
    defineRoute({
      method: "GET",
      url: "/v1/test/crash",
      auth: "public",
      schema: {},
      handler: async () => {
        throw new Error("driver said sam@example.com");
      },
    }),
    defineRoute({
      method: "GET",
      url: "/v1/test/db-down",
      auth: "public",
      schema: {},
      handler: async () => {
        throw Object.assign(new Error("connect ECONNREFUSED mongodb://user:secret@localhost:27017"), { name: "MongoServerSelectionError" });
      },
    }),
  ]);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("system routes", () => {
  it("reports health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("lists the ten modules", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/meta" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe("gifting-api");
    expect(body.modules.map((m: { name: string }) => m.name)).toEqual([
      "accounts",
      "ledger",
      "catalog",
      "campaigns",
      "recipients",
      "gifts",
      "fulfillment",
      "channels",
      "integrations",
      "reporting",
    ]);
  });
});

describe("error shape", () => {
  it("is { error: { code, message } } for an unknown route", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: "not_found", message: "Not found." } });
  });

  it("refuses input that fails its schema", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/test/echo", payload: { amountCents: 10.5 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_request");
  });

  it("strips fields the response schema doesn't list", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/test/echo", payload: { amountCents: 500 } });
    expect(res.json()).toEqual({ amountCents: 500 });
  });

  it("passes expected failures through with their code", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/test/gift" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: "gift_not_found", message: "Gift not found." } });
  });

  it("hides unexpected errors", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/test/crash" });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("sam@example.com");
    expect(res.json().error.code).toBe("internal_error");
  });
});

describe("database down", () => {
  it("answers 503 database_unavailable with a hint, never the driver's message", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/test/db-down" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: { code: "database_unavailable", message: "The database isn't reachable. Start it with pnpm db:up." } });
    expect(res.body).not.toContain("secret");
  });
});

describe("defineRoute", () => {
  it("refuses unversioned routes", () => {
    expect(() =>
      defineRoute({ method: "GET", url: "/gifts", schema: {}, handler: async () => undefined }),
    ).toThrow("must live under /v1");
  });
});
