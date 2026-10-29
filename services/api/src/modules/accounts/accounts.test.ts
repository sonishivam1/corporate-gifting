// Register, verify, sign in and out (ADR 0015): every way a caller must be
// refused. An in-memory identity provider and a recording mailer stand in for
// commercetools and SMTP.
import { createLogger } from "@gifting/logger";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { buildApp } from "../../app";
import { defineRoute, registerRoutes } from "../../http/route";
import type { Email, Mailer } from "../../mail/mailer";
import { signInScopeProblem } from "./ct-identity";
import type { Account, IdentityProvider } from "./identity";
import { createAccountsService } from "./service";

const silent = createLogger("test", {}, { level: "silent" });

/** commercetools in memory: accounts, email tokens and live access tokens. */
function fakeIdentity() {
  const accounts = new Map<string, Account & { password: string }>();
  const emailTokens = new Map<string, string>();
  const access = new Map<string, string>();
  const refresh = new Map<string, string>();
  const calls = { signIn: 0, revoked: [] as string[] };
  let n = 0;
  const strip = ({ password: _p, ...a }: Account & { password: string }): Account => ({ ...a });

  const identity: IdentityProvider = {
    async register(input) {
      if ([...accounts.values()].some((a) => a.email === input.email)) return { duplicate: true };
      const account = { id: `id-${++n}`, email: input.email, firstName: input.firstName, lastName: input.lastName, companyName: input.companyName ?? null, emailVerified: false, hasPassword: true, password: input.password };
      accounts.set(account.id, account);
      return { account: strip(account) };
    },
    async findByEmail(email) {
      const a = [...accounts.values()].find((x) => x.email === email);
      return a ? strip(a) : null;
    },
    async getAccount(id) {
      const a = accounts.get(id);
      return a ? strip(a) : null;
    },
    async createEmailToken(accountId) {
      for (const [t, id] of emailTokens) if (id === accountId) emailTokens.delete(t);
      const token = `email-token-${++n}`;
      emailTokens.set(token, accountId);
      return token;
    },
    async confirmEmail(token) {
      const id = emailTokens.get(token);
      if (!id) return null;
      emailTokens.delete(token);
      accounts.get(id)!.emailVerified = true;
      return strip(accounts.get(id)!);
    },
    async signIn(email, password) {
      calls.signIn += 1;
      const a = [...accounts.values()].find((x) => x.email === email && x.password === password);
      if (!a) return null;
      const accessToken = `access-${++n}`;
      const refreshToken = `refresh-${n}`;
      access.set(accessToken, a.id);
      refresh.set(refreshToken, a.id);
      return { accountId: a.id, tokens: { accessToken, refreshToken, expiresAt: Date.now() + 3_600_000 } };
    },
    async refresh(refreshToken) {
      const id = refresh.get(refreshToken);
      if (!id) return null;
      const accessToken = `access-${++n}`;
      access.set(accessToken, id);
      return { accessToken, expiresAt: Date.now() + 3_600_000 };
    },
    async verifyAccessToken(accessToken) {
      const id = access.get(accessToken);
      return id ? { accountId: id } : null;
    },
    async signOut(tokens) {
      if (tokens.accessToken) {
        access.delete(tokens.accessToken);
        calls.revoked.push(tokens.accessToken);
      }
      if (tokens.refreshToken) {
        refresh.delete(tokens.refreshToken);
        calls.revoked.push(tokens.refreshToken);
      }
    },
  };
  /** A record made without a password (like an older import); it can't sign in. */
  const addPasswordless = (email: string) => accounts.set(`legacy-${++n}`, { id: `legacy-${n}`, email, firstName: null, lastName: null, companyName: null, emailVerified: false, hasPassword: false, password: "" });
  return { identity, calls, emailTokens, addPasswordless };
}

function recordingMailer() {
  const sent: Email[] = [];
  const mailer: Mailer = { send: async (email) => void sent.push(email) };
  return { mailer, sent };
}

const ada = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", password: "Analytical-Engine-1843", acceptTerms: true };

let app: Awaited<ReturnType<typeof buildApp>>;
let fake: ReturnType<typeof fakeIdentity>;
let mail: ReturnType<typeof recordingMailer>;

beforeEach(async () => {
  await app?.close();
  fake = fakeIdentity();
  mail = recordingMailer();
  const accounts = createAccountsService({ identity: fake.identity, mailer: mail.mailer, appUrl: "http://localhost:3000", log: silent, opsEmails: ["priya@ops.example"] });
  app = await buildApp({ logger: silent, accounts });
  // Defined apart from the array, so its access mode stays the "account" default.
  const scopeRoute = defineRoute({
    method: "POST",
    url: "/v1/test/whoami",
    schema: { body: z.object({ accountId: z.string() }), response: z.object({ accountId: z.string() }) },
    handler: async ({ account }) => ({ accountId: account.id }),
  });
  registerRoutes(app, [
    scopeRoute,
    defineRoute({ method: "GET", url: "/v1/test/ops", auth: "ops", schema: { response: z.object({ ok: z.literal(true) }) }, handler: async () => ({ ok: true as const }) }),
  ]);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const post = (url: string, payload: object, token?: string) => app.inject({ method: "POST", url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
const code = (res: { json: () => { error?: { code: string } } }) => res.json().error?.code;
const linkToken = (email: Email) => decodeURIComponent(/token=([^\s"&]+)/.exec(email.text)![1]!);

async function registerAndVerify(person = ada) {
  await post("/v1/auth/register", person);
  const token = linkToken(mail.sent.at(-1)!);
  await post("/v1/auth/verify-email", { token });
}

describe("register", () => {
  it("creates an unverified account and emails a verification link", async () => {
    const res = await post("/v1/auth/register", { ...ada, email: " Ada@Example.com " });
    expect([res.statusCode, res.json()]).toEqual([202, { status: "check_email" }]);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: "ada@example.com", subject: "Verify your email for Gifting" });
    expect(mail.sent[0]!.text).toContain("http://localhost:3000/verify-email?token=");
  });

  it("refuses a weak password, a bad email, a missing name and unaccepted terms", async () => {
    for (const bad of [{ password: "short" }, { password: "analytical-engine-1843" }, { password: "AnalyticalEngine1843" }, { password: "Ada-Lovelace-1843" }, { email: "nope" }, { lastName: "" }, { acceptTerms: false }]) {
      const res = await post("/v1/auth/register", { ...ada, ...bad });
      expect([res.statusCode, code(res)], JSON.stringify(bad)).toEqual([400, "invalid_request"]);
    }
    expect(mail.sent).toHaveLength(0);
  });

  it("refuses an email that already has a verified account with 409, sending nothing", async () => {
    await registerAndVerify();
    const before = mail.sent.length;
    const res = await post("/v1/auth/register", { ...ada, password: "Someone-Else-2026" });
    expect([res.statusCode, res.json()]).toEqual([409, { error: { code: "email_taken", message: "An account with this email already exists. Sign in instead." } }]);
    expect(mail.sent).toHaveLength(before);
  });

  it("refuses an email held by a record without a password, sending nothing", async () => {
    fake.addPasswordless("legacy@example.com");
    const res = await post("/v1/auth/register", { ...ada, email: "legacy@example.com" });
    expect([res.statusCode, code(res)]).toEqual([409, "email_taken"]);
    expect(mail.sent).toHaveLength(0);
    await post("/v1/auth/resend-verification", { email: "legacy@example.com" });
    expect(mail.sent).toHaveLength(0);
  });

  it("re-sends the link when the existing account isn't verified yet", async () => {
    await post("/v1/auth/register", ada);
    await post("/v1/auth/register", ada);
    expect(mail.sent.map((m) => m.subject)).toEqual(["Verify your email for Gifting", "Verify your email for Gifting"]);
  });
});

describe("verify email", () => {
  it("accepts a link once, and refuses it after", async () => {
    await post("/v1/auth/register", ada);
    const token = linkToken(mail.sent[0]!);
    expect((await post("/v1/auth/verify-email", { token })).json()).toEqual({ status: "verified" });
    const again = await post("/v1/auth/verify-email", { token });
    expect([again.statusCode, code(again)]).toEqual([400, "invalid_token"]);
  });

  it("refuses an unknown token", async () => {
    const res = await post("/v1/auth/verify-email", { token: "made-up" });
    expect([res.statusCode, code(res)]).toEqual([400, "invalid_token"]);
  });

  it("only the newest link works after a resend", async () => {
    await post("/v1/auth/register", ada);
    const first = linkToken(mail.sent[0]!);
    await post("/v1/auth/resend-verification", { email: ada.email });
    expect((await post("/v1/auth/verify-email", { token: first })).statusCode).toBe(400);
    expect((await post("/v1/auth/verify-email", { token: linkToken(mail.sent[1]!) })).statusCode).toBe(200);
  });
});

describe("resend verification", () => {
  it("answers the same for unknown, unverified and verified emails, and only mails the unverified", async () => {
    await registerAndVerify();
    await post("/v1/auth/register", { ...ada, email: "grace@example.com" });
    const before = mail.sent.length;
    for (const email of ["nobody@example.com", "ada@example.com", "grace@example.com"]) {
      const res = await post("/v1/auth/resend-verification", { email });
      expect([res.statusCode, res.json()], email).toEqual([202, { status: "check_email" }]);
    }
    expect(mail.sent.slice(before).map((m) => m.to)).toEqual(["grace@example.com"]);
  });

  it("sends at most 3 emails an hour to one address", async () => {
    await post("/v1/auth/register", ada);
    for (let i = 0; i < 5; i += 1) await post("/v1/auth/resend-verification", { email: ada.email });
    expect(mail.sent).toHaveLength(3);
  });
});

describe("sign in", () => {
  it("returns tokens and the account once the email is verified", async () => {
    await registerAndVerify();
    const res = await post("/v1/auth/sign-in", { email: "ADA@example.com", password: ada.password });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String), account: { email: "ada@example.com", firstName: "Ada" } });
  });

  it("refuses a wrong password, or an unknown email, with the same generic 401", async () => {
    await registerAndVerify();
    for (const attempt of [{ email: ada.email, password: "wrong-password-1" }, { email: "nobody@example.com", password: ada.password }]) {
      const res = await post("/v1/auth/sign-in", attempt);
      expect([res.statusCode, res.json()], attempt.email).toEqual([401, { error: { code: "invalid_credentials", message: "The email or password is incorrect." } }]);
    }
  });

  it("refuses an unverified email with 403, and revokes the tokens the platform issued", async () => {
    await post("/v1/auth/register", ada);
    const res = await post("/v1/auth/sign-in", { email: ada.email, password: ada.password });
    expect([res.statusCode, code(res)]).toEqual([403, "email_not_verified"]);
    expect(fake.calls.revoked).toHaveLength(2);
  });

  it("locks an email after 5 failures in 15 minutes, before asking the platform", async () => {
    await registerAndVerify();
    for (let i = 0; i < 5; i += 1) await post("/v1/auth/sign-in", { email: ada.email, password: "wrong-password-1" });
    const callsBefore = fake.calls.signIn;
    const res = await post("/v1/auth/sign-in", { email: ada.email, password: ada.password });
    expect([res.statusCode, code(res)]).toEqual([429, "too_many_attempts"]);
    expect(fake.calls.signIn).toBe(callsBefore);
  });
});

describe("signed-in routes", () => {
  async function signedIn() {
    await registerAndVerify();
    return (await post("/v1/auth/sign-in", { email: ada.email, password: ada.password })).json() as { accessToken: string; refreshToken: string };
  }

  it("return the account for a valid token", async () => {
    const { accessToken } = await signedIn();
    const res = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.json()).toEqual({ id: expect.any(String), email: "ada@example.com", firstName: "Ada", lastName: "Lovelace", companyName: null });
  });

  it("refuse no token, a malformed header and an inactive token with 401", async () => {
    expect(code(await app.inject({ method: "GET", url: "/v1/me" }))).toBe("unauthenticated");
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: "Basic abc" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: "Bearer not-a-real-token" } })).statusCode).toBe(401);
  });

  it("take the account from the token, never from the request", async () => {
    const { accessToken } = await signedIn();
    const res = await post("/v1/test/whoami", { accountId: "someone-else" }, accessToken);
    expect(res.json().accountId).not.toBe("someone-else");
  });

  it("refresh with the refresh token; a refused refresh is 401", async () => {
    const { refreshToken } = await signedIn();
    const res = await post("/v1/auth/refresh", { refreshToken });
    expect(res.json()).toMatchObject({ accessToken: expect.any(String), expiresAt: expect.any(Number) });
    expect((await post("/v1/auth/refresh", { refreshToken: "revoked" })).statusCode).toBe(401);
  });

  it("stop working after sign-out, which revokes both tokens", async () => {
    const tokens = await signedIn();
    await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${tokens.accessToken}` } });
    expect((await post("/v1/auth/sign-out", tokens)).json()).toEqual({ status: "signed_out" });
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${tokens.accessToken}` } })).statusCode).toBe(401);
    expect((await post("/v1/auth/refresh", { refreshToken: tokens.refreshToken })).statusCode).toBe(401);
  });

  it("hide ops routes (404) from everyone but ops staff", async () => {
    const { accessToken } = await signedIn();
    const res = await app.inject({ method: "GET", url: "/v1/test/ops", headers: { authorization: `Bearer ${accessToken}` } });
    expect([res.statusCode, code(res)]).toEqual([404, "not_found"]);
  });
});

describe("without sign-in configured", () => {
  it("answers 503 on auth and signed-in routes; public routes work", async () => {
    const bare = await buildApp({ logger: silent });
    await bare.ready();
    for (const [method, url] of [["GET", "/v1/me"], ["POST", "/v1/auth/sign-in"]] as const) {
      const res = await bare.inject({ method, url, payload: method === "POST" ? { email: ada.email, password: "x" } : undefined });
      expect([res.statusCode, code(res)], url).toEqual([503, "auth_not_configured"]);
    }
    expect((await bare.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    await bare.close();
  });
});

describe("the sign-in API client", () => {
  it("may hold only the customer's own scopes", () => {
    expect(signInScopeProblem("manage_my_profile:corporate-gifting")).toBeNull();
    expect(signInScopeProblem("manage_my_profile:p view_published_products:p")).toBeNull();
    expect(signInScopeProblem("manage_project:corporate-gifting")).toMatch(/manage_project/);
    expect(signInScopeProblem("manage_my_profile:p manage_customers:p")).toMatch(/manage_customers/);
  });
});
