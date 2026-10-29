/**
 * Accounts in commercetools (ADR 0015): customers of the `gifting` store,
 * signed in with the OAuth 2.0 password flow.
 *
 * Two API clients, never mixed:
 * - the API's own client (`createCtApi`) creates customers, email tokens and
 *   confirmations;
 * - the sign-in client issues the customers' tokens and checks them
 *   (introspection) and revokes them. It may hold only `manage_my_*` scopes:
 *   with an admin client, every customer token would carry full project
 *   access, so `assertSignInClientScopes` refuses that at start-up.
 */
import type { Customer } from "@commercetools/platform-sdk";
import type { CtApi } from "@gifting/ct";
import { z } from "zod";

import type { Account, IdentityProvider, Tokens } from "./identity";

export type SignInClientConfig = { clientId: string; clientSecret: string };

/** Reads CTP_SIGNIN_CLIENT_ID and CTP_SIGNIN_CLIENT_SECRET; null when neither is set. */
export function loadSignInClientConfig(source: Record<string, string | undefined> = process.env): SignInClientConfig | null {
  const clientId = source.CTP_SIGNIN_CLIENT_ID?.trim();
  const clientSecret = source.CTP_SIGNIN_CLIENT_SECRET?.trim();
  if (!clientId && !clientSecret) return null;
  if (!clientId || !clientSecret) throw new Error("Set both CTP_SIGNIN_CLIENT_ID and CTP_SIGNIN_CLIENT_SECRET, or neither.");
  return { clientId, clientSecret };
}

/** The scopes a sign-in client may hold: only the customer's own data. */
export function signInScopeProblem(scope: string): string | null {
  const scopes = scope.split(/\s+/).filter(Boolean);
  const bad = scopes.filter((s) => !/^(manage_my_|view_published_products|create_anonymous_token)/.test(s));
  return bad.length > 0 ? `The sign-in API client must hold only manage_my_* scopes; it also holds ${bad.map((s) => s.split(":")[0]).join(", ")}.` : null;
}

const tokenResponse = z.object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number(), scope: z.string() });

type Options = { api: CtApi; authUrl: string; projectKey: string; storeKey: string; signIn: SignInClientConfig; fetch?: typeof fetch };

export function createCtIdentity(options: Options): IdentityProvider & { assertSignInClientScopes(): Promise<void> } {
  const { api, authUrl, projectKey, storeKey } = options;
  const http = options.fetch ?? fetch;
  const inStore = () => api.inStoreKeyWithStoreKeyValue({ storeKey });
  const basic = `Basic ${Buffer.from(`${options.signIn.clientId}:${options.signIn.clientSecret}`).toString("base64")}`;
  const myScope = `manage_my_profile:${projectKey}`;

  const oauth = async (path: string, form: Record<string, string>) => {
    const res = await http(`${authUrl}${path}`, { method: "POST", headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body };
  };

  const toAccount = (c: Customer): Account => ({
    id: c.id,
    email: c.email,
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    companyName: c.companyName ?? null,
    emailVerified: c.isEmailVerified,
    hasPassword: c.authenticationMode !== "ExternalAuth",
  });
  const inOurStore = (c: Customer) => c.stores.some((s) => s.key === storeKey);
  const isClientError = (err: unknown, status: number) => (err as { statusCode?: number })?.statusCode === status;
  const tokensFrom = (body: z.infer<typeof tokenResponse>): Tokens => ({
    accessToken: body.access_token,
    ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}),
    expiresAt: Date.now() + body.expires_in * 1000,
  });
  const customerIdIn = (scope: string) => /(?:^|\s)customer_id:([\w-]+)/.exec(scope)?.[1] ?? null;

  return {
    async assertSignInClientScopes() {
      const { status, body } = await oauth("/oauth/token", { grant_type: "client_credentials" });
      if (status !== 200 || typeof body.scope !== "string") throw new Error("The sign-in API client's credentials were refused.");
      const problem = signInScopeProblem(body.scope);
      if (problem) throw new Error(problem);
    },

    async register(account) {
      try {
        const { customer } = (await inStore().customers().post({ body: { ...account, authenticationMode: "Password" } }).execute()).body;
        return { account: toAccount(customer) };
      } catch (err) {
        const codes = (err as { body?: { errors?: { code: string }[] } }).body?.errors?.map((e) => e.code) ?? [];
        if (codes.includes("DuplicateField")) return { duplicate: true };
        throw err;
      }
    },

    async findByEmail(email) {
      if (email.includes('"')) return null;
      const found = (await inStore().customers().get({ queryArgs: { where: `lowercaseEmail = "${email}"`, limit: 1 } }).execute()).body.results[0];
      return found ? toAccount(found) : null;
    },

    async getAccount(id) {
      try {
        const customer = (await api.customers().withId({ ID: id }).get().execute()).body;
        return inOurStore(customer) ? toAccount(customer) : null;
      } catch (err) {
        if (isClientError(err, 404)) return null;
        throw err;
      }
    },

    async createEmailToken(accountId, ttlMinutes) {
      return (await inStore().customers().emailToken().post({ body: { id: accountId, ttlMinutes, invalidateOlderTokens: true } }).execute()).body.value;
    },

    async confirmEmail(token) {
      try {
        return toAccount((await inStore().customers().emailConfirm().post({ body: { tokenValue: token } }).execute()).body);
      } catch (err) {
        if (isClientError(err, 404) || isClientError(err, 400)) return null;
        throw err;
      }
    },

    async signIn(email, password) {
      const { status, body } = await oauth(`/oauth/${projectKey}/in-store/key=${storeKey}/customers/token`, { grant_type: "password", username: email, password, scope: myScope });
      if (status === 400 && body.error === "invalid_customer_account_credentials") return null;
      const parsed = tokenResponse.safeParse(body);
      if (status !== 200 || !parsed.success) throw new Error(`Password sign-in failed (${status} ${String(body.error ?? "")}).`);
      const accountId = customerIdIn(parsed.data.scope);
      if (!accountId) throw new Error("The sign-in token names no customer.");
      return { accountId, tokens: tokensFrom(parsed.data) };
    },

    async refresh(refreshToken) {
      const { status, body } = await oauth("/oauth/token", { grant_type: "refresh_token", refresh_token: refreshToken });
      if (status === 400 || status === 401) return null;
      const parsed = tokenResponse.safeParse(body);
      if (status !== 200 || !parsed.success) throw new Error(`Token refresh failed (${status}).`);
      return tokensFrom(parsed.data);
    },

    async verifyAccessToken(accessToken) {
      const { status, body } = await oauth("/oauth/introspect", { token: accessToken });
      if (status !== 200) throw new Error(`Token introspection failed (${status}).`);
      if (body.active !== true || typeof body.scope !== "string") return null;
      const accountId = customerIdIn(body.scope);
      return accountId ? { accountId } : null;
    },

    async signOut(tokens) {
      for (const [token, hint] of [
        [tokens.refreshToken, "refresh_token"],
        [tokens.accessToken, "access_token"],
      ] as const) {
        if (token) await oauth("/oauth/token/revoke", { token, token_type_hint: hint });
      }
    },
  };
}
