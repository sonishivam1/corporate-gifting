/**
 * Customer accounts in commercetools (ADR 0015): customers of one store,
 * signed in with commercetools' OAuth 2.0 password flow.
 *
 * Two API clients, never mixed:
 * - the API client (`createCtApi`) creates customers and email tokens and
 *   confirms them;
 * - the sign-in client issues the customers' own tokens, refreshes and
 *   revokes them. It may hold only `manage_my_*` scopes: with an admin
 *   client, every customer token would carry full project access, so
 *   `check` refuses that at start-up.
 *
 * The customer's tokens are this connector's platform session: the product
 * keeps them sealed in its own session and never reads them.
 */
import type { Customer as CtCustomer } from "@commercetools/platform-sdk";
import type { AccountsConnector, Customer } from "@gifting/commerce";
import type { CtApi } from "@gifting/ct";
import { z } from "zod";

export type SignInClientConfig = { clientId: string; clientSecret: string };

/** Reads CTP_SIGNIN_CLIENT_ID and CTP_SIGNIN_CLIENT_SECRET. */
export function loadSignInClientConfig(source: Record<string, string | undefined>): SignInClientConfig {
  const clientId = source.CTP_SIGNIN_CLIENT_ID?.trim();
  const clientSecret = source.CTP_SIGNIN_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Set CTP_SIGNIN_CLIENT_ID and CTP_SIGNIN_CLIENT_SECRET: the commercetools API client with only manage_my_profile.");
  return { clientId, clientSecret };
}

/** The scopes a sign-in client may hold: only the customer's own data. */
export function signInScopeProblem(scope: string): string | null {
  const scopes = scope.split(/\s+/).filter(Boolean);
  const bad = scopes.filter((s) => !/^(manage_my_|view_published_products|create_anonymous_token)/.test(s));
  return bad.length > 0 ? `The sign-in API client must hold only manage_my_* scopes; it also holds ${bad.map((s) => s.split(":")[0]).join(", ")}.` : null;
}

const tokenResponse = z.object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number(), scope: z.string() });
/** The platform session: the customer's access and refresh tokens. */
const platformSession = z.object({ a: z.string(), r: z.string() });

export type CtAccountsOptions = { api: CtApi; authUrl: string; projectKey: string; storeKey: string; signIn: SignInClientConfig; fetch?: typeof fetch };

export function createCtAccounts(options: CtAccountsOptions): Required<Pick<AccountsConnector, "register" | "signInWithPassword" | "renewPlatformSession" | "endPlatformSession">> &
  AccountsConnector & { assertSignInClientScopes(): Promise<void> } {
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

  const toCustomer = (c: CtCustomer): Customer => ({
    id: c.id,
    email: c.email.toLowerCase(),
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    companyName: c.companyName ?? null,
    emailVerified: c.isEmailVerified,
    hasPassword: c.authenticationMode !== "ExternalAuth",
  });
  const inOurStore = (c: CtCustomer) => c.stores.some((s) => s.key === storeKey);
  const isClientError = (err: unknown, ...statuses: number[]) => statuses.includes((err as { statusCode?: number })?.statusCode ?? 0);
  const customerIdIn = (scope: string) => /(?:^|\s)customer_id:([\w-]+)/.exec(scope)?.[1] ?? null;
  const seal = (accessToken: string, refreshToken: string) => JSON.stringify({ a: accessToken, r: refreshToken });
  const open = (session: string) => {
    try {
      return platformSession.parse(JSON.parse(session));
    } catch {
      return null;
    }
  };

  return {
    async assertSignInClientScopes() {
      const { status, body } = await oauth("/oauth/token", { grant_type: "client_credentials" });
      if (status !== 200 || typeof body.scope !== "string") throw new Error("The sign-in API client's credentials were refused.");
      const problem = signInScopeProblem(body.scope);
      if (problem) throw new Error(problem);
    },

    async register(customer) {
      try {
        const { customer: created } = (await inStore().customers().post({ body: { ...customer, authenticationMode: "Password" } }).execute()).body;
        return { customer: toCustomer(created) };
      } catch (err) {
        const codes = (err as { body?: { errors?: { code: string }[] } }).body?.errors?.map((e) => e.code) ?? [];
        if (codes.includes("DuplicateField")) return { duplicate: true };
        throw err;
      }
    },

    async findByEmail(email) {
      if (email.includes('"')) return null;
      const found = (await inStore().customers().get({ queryArgs: { where: `lowercaseEmail = "${email.toLowerCase()}"`, limit: 1 } }).execute()).body.results[0];
      return found ? toCustomer(found) : null;
    },

    async get(id) {
      try {
        const customer = (await api.customers().withId({ ID: id }).get().execute()).body;
        return inOurStore(customer) ? toCustomer(customer) : null;
      } catch (err) {
        if (isClientError(err, 400, 404)) return null;
        throw err;
      }
    },

    async markEmailVerified(id) {
      // commercetools verifies an email through a token; the product has
      // already checked its own link, so the connector creates and confirms one.
      try {
        const token = (await inStore().customers().emailToken().post({ body: { id, ttlMinutes: 5 } }).execute()).body.value;
        return toCustomer((await inStore().customers().emailConfirm().post({ body: { tokenValue: token } }).execute()).body);
      } catch (err) {
        if (isClientError(err, 400, 404)) return null;
        throw err;
      }
    },

    async updateName(id, { firstName, lastName }) {
      // The store's own customer only, at its current version; again once if it moved on in between.
      for (let attempt = 1; ; attempt++) {
        try {
          const { version } = (await inStore().customers().withId({ ID: id }).get().execute()).body;
          const updated = await inStore()
            .customers()
            .withId({ ID: id })
            .post({ body: { version, actions: [{ action: "setFirstName", firstName }, { action: "setLastName", lastName }] } })
            .execute();
          return toCustomer(updated.body);
        } catch (err) {
          if (isClientError(err, 400, 404)) return null;
          if (isClientError(err, 409) && attempt < 2) continue;
          throw err;
        }
      }
    },

    async signInWithPassword(email, password) {
      const { status, body } = await oauth(`/oauth/${projectKey}/in-store/key=${storeKey}/customers/token`, { grant_type: "password", username: email, password, scope: myScope });
      if (status === 400 && body.error === "invalid_customer_account_credentials") return null;
      const parsed = tokenResponse.safeParse(body);
      if (status !== 200 || !parsed.success || !parsed.data.refresh_token) throw new Error(`Password sign-in failed (${status} ${String(body.error ?? "")}).`);
      const customerId = customerIdIn(parsed.data.scope);
      if (!customerId) throw new Error("The sign-in token names no customer.");
      return { customerId, platformSession: seal(parsed.data.access_token, parsed.data.refresh_token) };
    },

    async renewPlatformSession(session) {
      const tokens = open(session);
      if (!tokens) return null;
      const { status, body } = await oauth("/oauth/token", { grant_type: "refresh_token", refresh_token: tokens.r });
      if (status === 400 || status === 401) return null;
      const parsed = tokenResponse.safeParse(body);
      if (status !== 200 || !parsed.success) throw new Error(`Token refresh failed (${status}).`);
      return seal(parsed.data.access_token, parsed.data.refresh_token ?? tokens.r);
    },

    async endPlatformSession(session) {
      const tokens = open(session);
      if (!tokens) return;
      await oauth("/oauth/token/revoke", { token: tokens.r, token_type_hint: "refresh_token" });
      await oauth("/oauth/token/revoke", { token: tokens.a, token_type_hint: "access_token" });
    },
  };
}
