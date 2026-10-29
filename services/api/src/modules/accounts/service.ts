/**
 * Register, verify, sign in and out (ADR 0015). The rules live here, not in
 * the identity provider, so every commerce platform gets the same behaviour:
 * - registering a taken email says so (a product decision, 29 Oct 2026), but
 *   sign-in and resend never reveal whether an email has an account;
 * - sign-in needs a verified email (the platform would let anyone in);
 * - failed sign-ins and emails are rate-limited per address;
 * - a signed-in request's account comes from its access token only.
 */
import { createHash } from "node:crypto";

import type { AccountView, RegisterInput, SessionTokens } from "@gifting/domain";
import type { Logger } from "@gifting/logger";

import { ApiError } from "../../http/errors";
import type { Mailer } from "../../mail/mailer";
import { verificationEmail } from "./emails";
import type { Account, IdentityProvider } from "./identity";
import { createRateLimiter } from "./rate-limit";

/** Verification links work for an hour (commercetools guidance: 1 to 2 hours). */
export const EMAIL_TOKEN_TTL_MINUTES = 60;
const MINUTE = 60_000;

export type AccountsService = ReturnType<typeof createAccountsService>;

export function createAccountsService(options: {
  identity: IdentityProvider;
  mailer: Mailer;
  /** The sender app's public URL, for links in emails. */
  appUrl: string;
  log: Logger;
  /** Verified emails of platform operators (ops routes). */
  opsEmails?: readonly string[];
  now?: () => number;
}) {
  const { identity, mailer, log } = options;
  const now = options.now ?? Date.now;
  const failedSignIns = createRateLimiter({ limit: 5, windowMs: 15 * MINUTE, now });
  const emailsSent = createRateLimiter({ limit: 3, windowMs: 60 * MINUTE, now });
  const tokenCache = new Map<string, { account: AccountView; expires: number }>();
  const opsEmails = new Set(options.opsEmails ?? []);
  const hash = (token: string) => createHash("sha256").update(token).digest("hex");

  const view = (a: Account): AccountView => ({ id: a.id, email: a.email, firstName: a.firstName, lastName: a.lastName, companyName: a.companyName });

  /** Sends a verification email, but never more than 3 an hour per address, and never fails the request. */
  async function sendVerification(account: Account) {
    const key = `email:${account.email}`;
    if (emailsSent.retryAfter(key) > 0) {
      log.warn({ accountId: account.id }, "verification email skipped: too many for this address");
      return;
    }
    emailsSent.hit(key);
    try {
      const token = await identity.createEmailToken(account.id, EMAIL_TOKEN_TTL_MINUTES);
      const link = `${options.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
      await mailer.send(verificationEmail(account.email, account.firstName, link, EMAIL_TOKEN_TTL_MINUTES));
      log.info({ accountId: account.id }, "verification email sent");
    } catch (err) {
      log.error({ err, accountId: account.id }, "verification email failed");
    }
  }

  return {
    /**
     * Creates the account and emails a verification link. An email that is
     * taken but not yet verified gets a fresh link instead (the person may
     * have lost the first one). One that is verified, or held by a record
     * without a password, is refused with 409 `email_taken`.
     */
    async register(input: RegisterInput): Promise<void> {
      const result = await identity.register({
        email: input.email,
        password: input.password,
        firstName: input.firstName,
        lastName: input.lastName,
        ...(input.companyName ? { companyName: input.companyName } : {}),
      });
      if ("account" in result) {
        log.info({ accountId: result.account.id }, "account registered");
        await sendVerification(result.account);
        return;
      }
      const existing = await identity.findByEmail(input.email);
      if (existing && existing.hasPassword && !existing.emailVerified) {
        await sendVerification(existing);
        return;
      }
      throw new ApiError(409, "email_taken", "An account with this email already exists. Sign in instead.");
    },

    async verifyEmail(token: string): Promise<void> {
      const account = await identity.confirmEmail(token);
      if (!account) throw new ApiError(400, "invalid_token", "This link is invalid or has expired. Ask for a new one.");
      log.info({ accountId: account.id }, "email verified");
    },

    /** Always the same answer; only an unverified account gets an email. */
    async resendVerification(email: string): Promise<void> {
      const account = await identity.findByEmail(email);
      if (account && account.hasPassword && !account.emailVerified) await sendVerification(account);
    },

    async signIn(email: string, password: string): Promise<SessionTokens & { account: AccountView }> {
      const key = `sign-in:${email}`;
      const wait = failedSignIns.retryAfter(key);
      if (wait > 0) throw new ApiError(429, "too_many_attempts", `Too many attempts. Try again in ${Math.ceil(wait / 60)} minutes.`);

      const result = await identity.signIn(email, password);
      if (!result) {
        failedSignIns.hit(key);
        throw new ApiError(401, "invalid_credentials", "The email or password is incorrect.");
      }
      const account = await identity.getAccount(result.accountId);
      if (!account || !account.emailVerified) {
        // The platform signs in unverified accounts; we don't. Throw the tokens away.
        await identity.signOut(result.tokens);
        if (!account) throw new ApiError(401, "invalid_credentials", "The email or password is incorrect.");
        throw new ApiError(403, "email_not_verified", "Verify your email address first. We can send you a new link.");
      }
      failedSignIns.reset(key);
      log.info({ accountId: account.id }, "signed in");
      return { ...result.tokens, account: view(account) };
    },

    async refresh(refreshToken: string): Promise<SessionTokens> {
      const tokens = await identity.refresh(refreshToken);
      if (!tokens) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
      return tokens;
    },

    async signOut(tokens: { accessToken?: string; refreshToken?: string }): Promise<void> {
      if (tokens.accessToken) tokenCache.delete(hash(tokens.accessToken));
      await identity.signOut(tokens);
    },

    /**
     * The account an access token belongs to. Checked with the platform and
     * cached for a minute; a revoked token may work until then, except here,
     * where sign-out clears it.
     */
    async authenticate(accessToken: string): Promise<AccountView> {
      const key = hash(accessToken);
      const cached = tokenCache.get(key);
      if (cached && cached.expires > now()) return cached.account;
      const verified = await identity.verifyAccessToken(accessToken);
      if (!verified) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
      const account = await identity.getAccount(verified.accountId);
      if (!account || !account.emailVerified) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
      const result = view(account);
      tokenCache.set(key, { account: result, expires: now() + MINUTE });
      if (tokenCache.size > 10_000) for (const [k, v] of tokenCache) if (v.expires <= now()) tokenCache.delete(k);
      return result;
    },

    isOps(account: AccountView): boolean {
      return opsEmails.has(account.email);
    },
  };
}
