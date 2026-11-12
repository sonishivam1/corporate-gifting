import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { OrganizationsConnector } from "@gifting/commerce";
import { memoryOrganizations } from "@gifting/commerce-memory";
import type { AccountView, Membership } from "@gifting/domain";

import { buildApp } from "./app";
import { defaultDeps } from "./deps";
import { ApiError } from "./http/errors";
import { defineRoute } from "./http/route";
import { orgDirectory } from "./modules/accounts/org";
import type { AccountsService } from "./modules/accounts/service";

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

const asUser = (user: string, team?: string) => ({ "x-dev-user": user, ...(team ? { "x-gifting-team": team } : {}) });

describe("development sign-in", () => {
  it("is never on in production", async () => {
    const res = await signedOut.inject({ method: "GET", url: "/v1/workspace", headers: asUser("user-maya") });
    expect([res.statusCode, res.json().error.code]).toEqual([503, "auth_not_configured"]);
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
      user: { id: "user-maya", role: "sender", roles: ["sender"] },
      company: { key: "company-lumen-labs" },
      companies: [{ key: "company-lumen-labs", name: "Lumen Labs" }],
      // The team's approver and the company's owner may approve.
      team: { key: "team-lumen-people", approverNames: ["Rowan Ellis", "Dana Okafor"] },
    });
    expect(res.json().teams).toHaveLength(2);
    expect(res.json().actions).toContain("campaign:create");
    expect(res.json().actions).not.toContain("campaign:approve");
  });

  it("switches team only to one the user belongs to, and refuses another as not found", async () => {
    const sales = await app.inject({ method: "GET", url: "/v1/workspace", headers: asUser("user-maya", "team-lumen-sales") });
    expect(sales.json().team.key).toBe("team-lumen-sales");
    // Never swapped for another team: a write would land somewhere the caller didn't choose.
    const notMine = await app.inject({ method: "GET", url: "/v1/workspace", headers: asUser("user-rowan", "team-lumen-sales") });
    expect([notMine.statusCode, notMine.json().error.code]).toEqual([404, "team_not_found"]);
  });

  it("falls back to the demo sender for an unknown user", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/workspace", headers: asUser("user-nobody") });
    expect(res.json().user.id).toBe("user-maya");
  });

  it("gives an owner and an admin every team, with their company role", async () => {
    for (const [user, role] of [["user-dana", "owner"], ["user-theo", "admin"]] as const) {
      const res = await app.inject({ method: "GET", url: "/v1/workspace", headers: asUser(user, "team-lumen-sales") });
      expect(res.json(), user).toMatchObject({ user: { role, roles: [role] }, team: { key: "team-lumen-sales" } });
      expect(res.json().teams.map((t: { key: string }) => t.key), user).toEqual(["team-lumen-people", "team-lumen-sales"]);
    }
  });

  it("falls back to the demo company's first member in a platform's directory, where the demo ids don't exist", async () => {
    const deps = defaultDeps({ DEV_AUTH: "1" });
    deps.org = orgDirectory(
      memoryOrganizations({
        companies: [{ key: "company-lumen-labs", name: "Lumen Labs", teams: [{ key: "team-lumen-people", name: "People", approvalThresholdCents: 0 }] }],
        members: [{ id: "c-owner", name: "Lena Ortiz", memberships: [{ companyKey: "company-lumen-labs", role: "owner" }] }],
      }),
      { ttlMs: 0 },
    );
    const platform = await buildApp({ deps });
    const res = await platform.inject({ method: "GET", url: "/v1/workspace", headers: asUser("user-maya") });
    await platform.close();
    expect(res.json()).toMatchObject({ user: { id: "c-owner", role: "owner" }, team: { key: "team-lumen-people" } });
  });

  it("refuses a company the person doesn't belong to as not found", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/workspace", headers: { ...asUser("user-maya"), "x-gifting-company": "company-orbit-studio" } });
    expect([res.statusCode, res.json().error.code]).toEqual([404, "company_not_found"]);
  });
});

describe("permissions", () => {
  // Refused before the handler runs, so none of these reach the database.
  const refused = async (user: string, method: "GET" | "POST", url: string, team?: string) => {
    const res = await app.inject({ method, url, headers: asUser(user, team), ...(method === "POST" ? { payload: {} } : {}) });
    return [res.statusCode, res.json().error?.code];
  };

  it("keeps approvers from sending, editing collections, managing gifts or reading the directory", async () => {
    expect(await refused("user-rowan", "POST", "/v1/campaigns/estimate")).toEqual([403, "forbidden"]);
    expect(await refused("user-rowan", "POST", "/v1/campaigns")).toEqual([403, "forbidden"]);
    expect(await refused("user-rowan", "POST", "/v1/collections")).toEqual([403, "forbidden"]);
    expect(await refused("user-rowan", "POST", "/v1/gifts/gft-1/cancel")).toEqual([403, "forbidden"]);
    expect(await refused("user-rowan", "GET", "/v1/recipients")).toEqual([403, "forbidden"]);
    expect(await refused("user-rowan", "POST", "/v1/recipients/import")).toEqual([403, "forbidden"]);
  });

  it("lets only owners and approvers approve or decline", async () => {
    for (const user of ["user-maya", "user-theo"]) {
      expect(await refused(user, "POST", "/v1/campaigns/cmp-1/approve"), user).toEqual([403, "forbidden"]);
      expect(await refused(user, "POST", "/v1/campaigns/cmp-1/decline"), user).toEqual([403, "forbidden"]);
    }
  });

  it("uses the roles on the chosen team, and refuses a team the person has no role on before any permission", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/workspace", headers: asUser("user-rowan") });
    expect(res.json().team.key).toBe("team-lumen-people");
    expect(res.json().actions).toContain("campaign:approve");
    expect(await refused("user-rowan", "POST", "/v1/campaigns/cmp-1/approve", "team-lumen-sales")).toEqual([404, "team_not_found"]);
  });

  it("requires every member route to declare a permission, and no other route to", () => {
    const handler = async () => undefined;
    expect(() => defineRoute({ method: "GET", url: "/v1/x", auth: "member", schema: {}, handler })).toThrow(/permission/);
    expect(() => defineRoute({ method: "GET", url: "/v1/x", auth: "account", permission: "reports:view" as never, schema: {}, handler })).toThrow(/permission/);
  });
});

describe("signed-in members (no development session)", () => {
  // Fictional people: one in two companies; anyone else is in none.
  const orgs = memoryOrganizations({
    companies: [
      { key: "company-a", name: "Company A", teams: [{ key: "team-a1", name: "One", approvalThresholdCents: null }] },
      { key: "company-b", name: "Company B", teams: [{ key: "team-b1", name: "One", approvalThresholdCents: 0 }, { key: "team-b2", name: "Two", approvalThresholdCents: 0 }] },
    ],
    members: [{ id: "cust-1", name: "Ada Park", memberships: [{ companyKey: "company-a", teamKey: "team-a1", role: "approver" }, { companyKey: "company-b", teamKey: "team-b2", role: "sender" }] }],
  });
  const account = (id: string): AccountView => ({ id, email: `${id}@people.example`, firstName: "Ada", lastName: "Park", companyName: null });
  const accounts = {
    async authenticate(token: string) {
      if (!token.startsWith("token-")) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
      return account(token.slice("token-".length));
    },
    isOps: () => false,
  } as unknown as AccountsService;
  let member: FastifyInstance;
  let noOrgs: FastifyInstance;

  beforeAll(async () => {
    // Assigned, not spread: the default deps open the database lazily, and these requests never reach it.
    const deps = defaultDeps({ NODE_ENV: "production" });
    deps.org = orgDirectory(orgs, { ttlMs: 0 });
    member = await buildApp({ accounts, deps });
    noOrgs = await buildApp({ accounts, deps: defaultDeps({ NODE_ENV: "production" }) });
  });

  afterAll(async () => {
    await member.close();
    await noOrgs.close();
  });

  const workspace = (target: FastifyInstance, token: string | null, headers: Record<string, string> = {}) =>
    target.inject({ method: "GET", url: "/v1/workspace", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });

  it("needs a signed-in person, and ignores the development headers", async () => {
    expect((await workspace(member, null, asUser("user-maya"))).statusCode).toBe(401);
  });

  it("opens the person's first company, and switches only to their own", async () => {
    const first = await workspace(member, "token-cust-1");
    expect(first.json()).toMatchObject({ user: { id: "cust-1", name: "Ada Park", roles: ["approver"] }, company: { key: "company-a" }, devUsers: null });
    expect(first.json().companies.map((c: { key: string }) => c.key)).toEqual(["company-a", "company-b"]);
    const b = await workspace(member, "token-cust-1", { "x-gifting-company": "company-b" });
    expect(b.json()).toMatchObject({ company: { key: "company-b" }, team: { key: "team-b2" }, user: { roles: ["sender"] } });
    expect(b.json().teams).toEqual([{ key: "team-b2", name: "Two" }]);
    // Only a team they hold a role on: another is refused, never replaced.
    const wrongTeam = await workspace(member, "token-cust-1", { "x-gifting-company": "company-b", "x-gifting-team": "team-b1" });
    expect([wrongTeam.statusCode, wrongTeam.json().error.code]).toEqual([404, "team_not_found"]);
    // A team of the other company is not one of this company's.
    const otherCompanysTeam = await workspace(member, "token-cust-1", { "x-gifting-company": "company-b", "x-gifting-team": "team-a1" });
    expect(otherCompanysTeam.json().error.code).toBe("team_not_found");
    const notTheirs = await workspace(member, "token-cust-1", { "x-gifting-company": "company-c" });
    expect([notTheirs.statusCode, notTheirs.json().error.code]).toEqual([404, "company_not_found"]);
  });

  it("counts a team with no threshold as 0: everything needs approval", async () => {
    expect((await workspace(member, "token-cust-1")).json().team.approvalThresholdCents).toBe(0);
  });

  it("checks a write against the person's roles now, while reads may use the minute's cache", async () => {
    // A platform where the person's one role can be taken away, counting how often it is asked.
    let held: Membership[] = [{ companyKey: "company-a", teamKey: "team-a1", role: "sender" }];
    let asked = 0;
    const revocable: OrganizationsConnector = {
      ...orgs,
      membershipsOf: async () => {
        asked += 1;
        return held.map((m) => ({ ...m }));
      },
    };
    const deps = defaultDeps({ NODE_ENV: "production" });
    deps.org = orgDirectory(revocable, { ttlMs: 60_000 });
    const cached = await buildApp({ accounts, deps });
    try {
      expect((await workspace(cached, "token-cust-1")).statusCode).toBe(200);
      expect((await workspace(cached, "token-cust-1")).statusCode).toBe(200);
      expect(asked).toBe(1);

      held = [];
      // A read within the minute still sees the old role…
      expect((await workspace(cached, "token-cust-1")).statusCode).toBe(200);
      // …but a write asks the platform, and is refused before its handler runs.
      const write = await cached.inject({ method: "POST", url: "/v1/campaigns/estimate", headers: { authorization: "Bearer token-cust-1" }, payload: {} });
      expect([write.statusCode, write.json().error.code]).toEqual([403, "no_membership"]);
      expect(asked).toBe(2);
      // And the fresh answer replaces the cached one, so reads stop too.
      expect((await workspace(cached, "token-cust-1")).json().error.code).toBe("no_membership");
    } finally {
      await cached.close();
    }
  });

  it("refuses someone in no company with no_membership", async () => {
    const res = await workspace(member, "token-cust-2");
    expect([res.statusCode, res.json().error.code]).toEqual([403, "no_membership"]);
  });

  it("answers 503 when the platform has no organizations, after checking who is calling", async () => {
    expect((await workspace(noOrgs, null)).statusCode).toBe(401);
    const res = await workspace(noOrgs, "token-cust-1");
    expect([res.statusCode, res.json().error.code]).toEqual([503, "organizations_not_configured"]);
  });
});

describe("scope", () => {
  it("treats another team's overview as not found, and refuses an unknown range", async () => {
    const other = await app.inject({ method: "GET", url: "/v1/teams/team-lumen-sales/overview" });
    expect([other.statusCode, other.json().error.code]).toEqual([404, "not_found"]);
    const range = await app.inject({ method: "GET", url: "/v1/teams/team-lumen-people/overview?range=1y" });
    expect(range.statusCode).toBe(400);
    const signedOutRes = await signedOut.inject({ method: "GET", url: "/v1/teams/team-lumen-people/overview" });
    expect(signedOutRes.statusCode).toBe(503);
  });

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
