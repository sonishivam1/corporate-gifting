// Register, verify, sign in and out (ADR 0015): every way a caller must be
// refused. The in-memory commerce connector stands in for the platform (it
// passes the same conformance suite as commercetools), and a recording
// mailer for SMTP.
import { createMemoryConnector, type MemoryOptions } from "@gifting/commerce-memory";
import { createLogger } from "@gifting/logger";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { buildApp } from "../../app";
import { defineRoute, registerRoutes } from "../../http/route";
import type { Email, Mailer } from "../../mail/mailer";
import { createAccountsService } from "./service";
import { ACCESS_TTL_MS } from "./tokens";

const silent = createLogger("test", {}, { level: "silent" });
const SECRET = "ab".repeat(32);

function recordingMailer() {
  const sent: Email[] = [];
  const mailer: Mailer = {
    send: async (email) => {
      sent.push(email);
      return { messageId: null };
    },
  };
  return { mailer, sent };
}

const ada = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", password: "Analytical-Engine-1843", acceptTerms: true };

let app: Awaited<ReturnType<typeof buildApp>>;
let platform: ReturnType<typeof createMemoryConnector>;
let mail: ReturnType<typeof recordingMailer>;
let clock: number;

async function start(options: MemoryOptions = {}, secret = SECRET) {
  await app?.close();
  platform = createMemoryConnector(options);
  mail = recordingMailer();
  clock = Date.UTC(2026, 9, 29, 9);
  const accounts = createAccountsService({ connector: platform.connector, mailer: mail.mailer, appUrl: "http://localhost:3000", log: silent, sessionSecret: secret, opsEmails: ["priya@ops.example"], now: () => clock });
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
}

beforeEach(async () => {
  await start();
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
    platform.addPasswordless("legacy@example.com");
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

  it("refuses an unknown token, and a link after an hour", async () => {
    const res = await post("/v1/auth/verify-email", { token: "made-up" });
    expect([res.statusCode, code(res)]).toEqual([400, "invalid_token"]);
    await post("/v1/auth/register", ada);
    clock += 60 * 60_000 + 1000;
    expect(code(await post("/v1/auth/verify-email", { token: linkToken(mail.sent[0]!) }))).toBe("invalid_token");
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

  it("refuses an unverified email with 403, and ends the session the platform started", async () => {
    await post("/v1/auth/register", ada);
    const res = await post("/v1/auth/sign-in", { email: ada.email, password: ada.password });
    expect([res.statusCode, code(res)]).toEqual([403, "email_not_verified"]);
    expect(platform.calls.endedSessions).toHaveLength(1);
  });

  it("locks an email after 5 failures in 15 minutes, before asking the platform", async () => {
    await registerAndVerify();
    for (let i = 0; i < 5; i += 1) await post("/v1/auth/sign-in", { email: ada.email, password: "wrong-password-1" });
    const callsBefore = platform.calls.signIns;
    const res = await post("/v1/auth/sign-in", { email: ada.email, password: ada.password });
    expect([res.statusCode, code(res)]).toEqual([429, "too_many_attempts"]);
    expect(platform.calls.signIns).toBe(callsBefore);
  });
});

const me = (token: string) => app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });

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

  it("refresh with the refresh token; a made-up one is 401", async () => {
    const { refreshToken } = await signedIn();
    const res = await post("/v1/auth/refresh", { refreshToken });
    expect(res.json()).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String), expiresAt: expect.any(Number) });
    expect((await post("/v1/auth/refresh", { refreshToken: "revoked" })).statusCode).toBe(401);
  });

  it("expire access tokens after 15 minutes; a refresh gives a working one", async () => {
    const { accessToken, refreshToken } = await signedIn();
    clock += ACCESS_TTL_MS + 1000;
    expect((await me(accessToken)).statusCode).toBe(401);
    const renewed = (await post("/v1/auth/refresh", { refreshToken })).json() as { accessToken: string };
    expect((await me(renewed.accessToken)).statusCode).toBe(200);
  });

  it("end the whole session after 7 days, however active", async () => {
    let { refreshToken } = await signedIn();
    for (let day = 0; day < 6; day += 1) {
      clock += 24 * 3_600_000;
      refreshToken = ((await post("/v1/auth/refresh", { refreshToken })).json() as { refreshToken: string }).refreshToken;
    }
    clock += 24 * 3_600_000 + 1000;
    expect((await post("/v1/auth/refresh", { refreshToken })).statusCode).toBe(401);
  });

  it("stop working after sign-out, which ends the platform's session too", async () => {
    const tokens = await signedIn();
    await me(tokens.accessToken);
    expect((await post("/v1/auth/sign-out", tokens)).json()).toEqual({ status: "signed_out" });
    expect((await me(tokens.accessToken)).statusCode).toBe(401);
    expect((await post("/v1/auth/refresh", { refreshToken: tokens.refreshToken })).statusCode).toBe(401);
    expect(platform.calls.endedSessions).toHaveLength(1);
  });

  it("refuse a token sealed with another deployment's secret, and one kind of token used as another", async () => {
    const { accessToken, refreshToken } = await signedIn();
    expect((await me(refreshToken)).statusCode).toBe(401);
    expect((await post("/v1/auth/refresh", { refreshToken: accessToken })).statusCode).toBe(401);
    await start({}, "cd".repeat(32));
    expect((await me(accessToken)).statusCode).toBe(401);
  });

  it("stop at the next refresh when the platform has ended its own session", async () => {
    const { refreshToken } = await signedIn();
    // The platform ends its session on its side (for example after a password change).
    await platform.connector.accounts.endPlatformSession!("memory-session-1");
    expect((await post("/v1/auth/refresh", { refreshToken })).statusCode).toBe(401);
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

describe("sign-in modes", () => {
  it("tell the app this deployment signs in with a password", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/auth/options" })).json()).toEqual({ signIn: "password" });
    expect(code(await post("/v1/auth/hosted/start", {}))).toBe("not_supported");
  });

  describe("on a platform with its own sign-in page", () => {
    beforeEach(async () => {
      await start({ signIn: "hosted" });
    });

    async function hostedSignIn(email = ada.email) {
      const { url, state } = (await post("/v1/auth/hosted/start", { loginHint: email })).json() as { url: string; state: string };
      const back = new URL(url);
      expect(back.origin + back.pathname).toBe("http://localhost:3000/auth/callback");
      return { code: back.searchParams.get("code")!, state };
    }

    it("tells the app, and refuses the password routes", async () => {
      expect((await app.inject({ method: "GET", url: "/v1/auth/options" })).json()).toEqual({ signIn: "hosted" });
      expect(code(await post("/v1/auth/register", ada))).toBe("not_supported");
      expect(code(await post("/v1/auth/sign-in", { email: ada.email, password: ada.password }))).toBe("not_supported");
    });

    it("signs a person in through the platform's page, once per code", async () => {
      const { code: platformCode, state } = await hostedSignIn();
      const res = await post("/v1/auth/hosted/finish", { code: platformCode, state });
      expect(res.json()).toMatchObject({ accessToken: expect.any(String), account: { email: "ada@example.com" } });
      expect((await me(res.json().accessToken)).json()).toMatchObject({ email: "ada@example.com" });
      expect(code(await post("/v1/auth/hosted/finish", { code: platformCode, state }))).toBe("sign_in_failed");
    });

    it("refuses a state it didn't issue, or one older than 10 minutes", async () => {
      const first = await hostedSignIn();
      expect(code(await post("/v1/auth/hosted/finish", { code: first.code, state: "made-up" }))).toBe("invalid_state");
      clock += 10 * 60_000 + 1000;
      expect(code(await post("/v1/auth/hosted/finish", first))).toBe("invalid_state");
    });
  });
});
