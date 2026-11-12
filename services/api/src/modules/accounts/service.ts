/**
 * Register, verify, sign in and out (ADR 0015), the same on every commerce
 * platform (plan: commerce-connectors.md). The platform is a connector; the
 * rules, the sessions, the verification links and the emails are ours:
 * - registering a taken email says so (a product decision, 29 Oct 2026), but
 *   sign-in and resend never reveal whether an email has an account;
 * - sign-in needs a verified email (platforms would let anyone in);
 * - failed sign-ins and emails are rate-limited per address;
 * - a signed-in request's account comes from our own access token only.
 *
 * Sign-out and "only the newest link works" are kept in memory, like the
 * rate limits: they fit the POC's single API instance and move to MongoDB
 * before there's more than one.
 */
import { randomUUID } from "node:crypto";

import type { CommerceConnector, Customer, PlatformSignIn, SignInMode } from "@gifting/commerce";
import type { AccountView, RegisterInput, SessionTokens } from "@gifting/domain";
import type { Logger } from "@gifting/logger";

import { ApiError } from "../../http/errors";
import type { Mailer } from "../../mail/mailer";
import { verificationEmail } from "./emails";
import { createRateLimiter } from "./rate-limit";
import { ACCESS_TTL_MS, createTokens, SESSION_MAX_MS, STATE_TTL_MS, VERIFY_TTL_MS } from "./tokens";

const MINUTE = 60_000;

export type AccountsService = ReturnType<typeof createAccountsService>;

const unauthenticated = () => new ApiError(401, "unauthenticated", "Sign in to continue.");
const invalidCredentials = () => new ApiError(401, "invalid_credentials", "The email or password is incorrect.");
const notVerified = () => new ApiError(403, "email_not_verified", "Verify your email address first. We can send you a new link.");
const invalidLink = () => new ApiError(400, "invalid_token", "This link is invalid or has expired. Ask for a new one.");

export function createAccountsService(options: {
  connector: CommerceConnector;
  mailer: Mailer;
  /** The sender app's public URL, for links in emails and the hosted sign-in return. */
  appUrl: string;
  log: Logger;
  /** 32 bytes in hex: encrypts our sessions, links and sign-in state. */
  sessionSecret: string;
  /** Verified emails of platform operators (ops routes). */
  opsEmails?: readonly string[];
  now?: () => number;
}) {
  const { connector, mailer, log } = options;
  const { accounts } = connector;
  const con = connector.id;
  const now = options.now ?? Date.now;
  const tokens = createTokens(options.sessionSecret, now);
  const failedSignIns = createRateLimiter({ limit: 5, windowMs: 15 * MINUTE, now });
  const emailsSent = createRateLimiter({ limit: 3, windowMs: 60 * MINUTE, now });
  /** Ended sessions, until they would have expired anyway. */
  const revoked = new Map<string, number>();
  /** When each customer's newest verification link was made; older links stop working. */
  const newestLink = new Map<string, number>();
  const accountCache = new Map<string, { account: AccountView; expires: number }>();
  const opsEmails = new Set(options.opsEmails ?? []);
  const callbackUrl = `${options.appUrl}/auth/callback`;

  const view = (c: Customer): AccountView => ({ id: c.id, email: c.email, firstName: c.firstName, lastName: c.lastName, companyName: c.companyName });

  function requireMode(mode: SignInMode) {
    if (connector.capabilities.signIn !== mode) {
      throw new ApiError(400, "not_supported", mode === "password" ? "This service signs people in on its commerce platform's page." : "This service signs people in with a password.");
    }
  }

  function isRevoked(sid: string) {
    const until = revoked.get(sid);
    return until !== undefined && until > now();
  }

  function revoke(sid: string, until: number) {
    revoked.set(sid, until);
    accountCache.delete(sid);
    if (revoked.size > 10_000) for (const [k, v] of revoked) if (v <= now()) revoked.delete(k);
  }

  async function issueSession(customerId: string, platformSession: string | undefined, sid: string = randomUUID(), start = now()): Promise<SessionTokens> {
    const expiresAt = Math.min(now() + ACCESS_TTL_MS, start + SESSION_MAX_MS);
    return {
      accessToken: await tokens.seal({ typ: "access", sid, sub: customerId, con }, expiresAt),
      refreshToken: await tokens.seal({ typ: "refresh", sid, sub: customerId, con, start, ...(platformSession ? { ps: platformSession } : {}) }, start + SESSION_MAX_MS),
      expiresAt,
    };
  }

  /** A signed-in person: verified, or we end the platform's session and refuse. */
  async function completeSignIn(result: PlatformSignIn): Promise<SessionTokens & { account: AccountView }> {
    const customer = await accounts.get(result.customerId);
    if (!customer || !customer.emailVerified) {
      if (result.platformSession) await accounts.endPlatformSession?.(result.platformSession);
      if (!customer) throw invalidCredentials();
      throw notVerified();
    }
    log.info({ accountId: customer.id, connection: con }, "signed in");
    return { ...(await issueSession(customer.id, result.platformSession)), account: view(customer) };
  }

  /** Sends a verification email, but never more than 3 an hour per address, and never fails the request. */
  async function sendVerification(customer: Customer) {
    const key = `email:${customer.email}`;
    if (emailsSent.retryAfter(key) > 0) {
      log.warn({ accountId: customer.id }, "verification email skipped: too many for this address");
      return;
    }
    emailsSent.hit(key);
    try {
      // Strictly later than the last link, so two links never share a stamp.
      const at = Math.max(now(), (newestLink.get(customer.id) ?? 0) + 1);
      const token = await tokens.seal({ typ: "verify", sub: customer.id, con, email: customer.email, at }, at + VERIFY_TTL_MS);
      newestLink.set(customer.id, at);
      const link = `${options.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
      await mailer.send(verificationEmail(customer.email, customer.firstName, link, VERIFY_TTL_MS / MINUTE));
      log.info({ accountId: customer.id }, "verification email sent");
    } catch (err) {
      log.error({ err, accountId: customer.id }, "verification email failed");
    }
  }

  return {
    /** How this deployment signs people in, from its connector's capabilities. */
    options(): { signIn: SignInMode } {
      return { signIn: connector.capabilities.signIn };
    },

    /**
     * Creates the account and emails a verification link. An email that is
     * taken but not yet verified gets a fresh link instead (the person may
     * have lost the first one). One that is verified, or held by a record
     * without a password, is refused with 409 `email_taken`.
     */
    async register(input: RegisterInput): Promise<void> {
      requireMode("password");
      const result = await accounts.register!({
        email: input.email,
        password: input.password,
        firstName: input.firstName,
        lastName: input.lastName,
        ...(input.companyName ? { companyName: input.companyName } : {}),
      });
      if ("customer" in result) {
        log.info({ accountId: result.customer.id, connection: con }, "account registered");
        await sendVerification(result.customer);
        return;
      }
      const existing = await accounts.findByEmail(input.email);
      if (existing && existing.hasPassword && !existing.emailVerified) {
        await sendVerification(existing);
        return;
      }
      throw new ApiError(409, "email_taken", "An account with this email already exists. Sign in instead.");
    },

    /** Works once, within the hour, and only for the newest link this API instance knows of. */
    async verifyEmail(token: string): Promise<void> {
      const claims = await tokens.open(token, "verify");
      const newest = claims ? newestLink.get(claims.sub) : undefined;
      if (!claims || claims.con !== con || (newest !== undefined && newest !== claims.at)) throw invalidLink();
      const customer = await accounts.get(claims.sub);
      if (!customer || customer.email !== claims.email || customer.emailVerified) throw invalidLink();
      await accounts.markEmailVerified(customer.id);
      newestLink.delete(customer.id);
      log.info({ accountId: customer.id }, "email verified");
    },

    /** Always the same answer; only an unverified account gets an email. */
    async resendVerification(email: string): Promise<void> {
      requireMode("password");
      const customer = await accounts.findByEmail(email);
      if (customer && customer.hasPassword && !customer.emailVerified) await sendVerification(customer);
    },

    async signIn(email: string, password: string): Promise<SessionTokens & { account: AccountView }> {
      requireMode("password");
      const key = `sign-in:${email}`;
      const wait = failedSignIns.retryAfter(key);
      if (wait > 0) throw new ApiError(429, "too_many_attempts", `Too many attempts. Try again in ${Math.ceil(wait / 60)} minutes.`);

      const result = await accounts.signInWithPassword!(email, password);
      if (!result) {
        failedSignIns.hit(key);
        throw invalidCredentials();
      }
      const session = await completeSignIn(result);
      failedSignIns.reset(key);
      return session;
    },

    /** The platform's sign-in page to send the person to, and the state the app must check on return. */
    async startHostedSignIn(loginHint?: string): Promise<{ url: string; state: string }> {
      requireMode("hosted");
      const state = await tokens.seal({ typ: "state", nonce: randomUUID(), con }, now() + STATE_TTL_MS);
      const url = await accounts.hostedSignIn!.start({ state, redirectUri: callbackUrl, ...(loginHint ? { loginHint } : {}) });
      return { url, state };
    },

    async finishHostedSignIn(code: string, state: string): Promise<SessionTokens & { account: AccountView }> {
      requireMode("hosted");
      const claims = await tokens.open(state, "state");
      if (!claims || claims.con !== con) throw new ApiError(400, "invalid_state", "This sign-in took too long or didn't start here. Try again.");
      const result = await accounts.hostedSignIn!.finish({ code, redirectUri: callbackUrl });
      if (!result) throw new ApiError(401, "sign_in_failed", "Sign-in didn't complete. Try again.");
      return completeSignIn(result);
    },

    /** New tokens for a live session; the platform's own session is renewed with it. */
    async refresh(refreshToken: string): Promise<SessionTokens> {
      const claims = await tokens.open(refreshToken, "refresh");
      if (!claims || claims.con !== con || isRevoked(claims.sid)) throw unauthenticated();
      const customer = await accounts.get(claims.sub);
      if (!customer || !customer.emailVerified) throw unauthenticated();
      let platformSession = claims.ps;
      if (platformSession && accounts.renewPlatformSession) {
        const renewed = await accounts.renewPlatformSession(platformSession);
        if (!renewed) {
          revoke(claims.sid, claims.start + SESSION_MAX_MS);
          throw unauthenticated();
        }
        platformSession = renewed;
      }
      return issueSession(customer.id, platformSession, claims.sid, claims.start);
    },

    /** Ends the session: our tokens stop working at once, and the platform's session is ended. */
    async signOut(given: { accessToken?: string; refreshToken?: string }): Promise<void> {
      const refresh = given.refreshToken ? await tokens.open(given.refreshToken, "refresh") : null;
      const access = given.accessToken ? await tokens.open(given.accessToken, "access") : null;
      const sid = refresh?.sid ?? access?.sid;
      if (sid) revoke(sid, (refresh?.start ?? now()) + SESSION_MAX_MS);
      if (refresh?.ps) await accounts.endPlatformSession?.(refresh.ps);
    },

    /** The account an access token belongs to. The customer is read from the platform at most once a minute per session. */
    async authenticate(accessToken: string): Promise<AccountView> {
      const claims = await tokens.open(accessToken, "access");
      if (!claims || claims.con !== con || isRevoked(claims.sid)) throw unauthenticated();
      const cached = accountCache.get(claims.sid);
      if (cached && cached.expires > now()) return cached.account;
      const customer = await accounts.get(claims.sub);
      if (!customer || !customer.emailVerified) throw unauthenticated();
      const account = view(customer);
      accountCache.set(claims.sid, { account, expires: now() + MINUTE });
      if (accountCache.size > 10_000) for (const [k, v] of accountCache) if (v.expires <= now()) accountCache.delete(k);
      return account;
    },

    isOps(account: AccountView): boolean {
      return opsEmails.has(account.email);
    },

    /** Whether the platform lets people change their name here (ADR 0017). */
    get canEditName(): boolean {
      return Boolean(accounts.updateName);
    },

    /** Changes the person's first and last name on the platform. Their sessions see it at once. */
    async updateName(customerId: string, name: { firstName: string; lastName: string }): Promise<AccountView> {
      if (!accounts.updateName) throw new ApiError(501, "not_supported", "Names are managed in your commerce platform, not here.");
      const customer = await accounts.updateName(customerId, name);
      if (!customer) throw unauthenticated();
      const account = view(customer);
      for (const [sid, entry] of accountCache) if (entry.account.id === customerId) accountCache.set(sid, { ...entry, account });
      return account;
    },
  };
}
