/**
 * A commerce platform in memory. It passes the conformance suite, so the
 * product's tests run against it instead of a real platform, and it can play
 * a platform that signs people in differently ("hosted" mode).
 *
 * Its hosted sign-in page approves at once: `start` sends the person straight
 * back with a code for the email in `loginHint`. That lets the whole hosted
 * flow run locally without a platform. Never for production.
 */
import {
  type CatalogConnector,
  type CatalogItem,
  type CommerceConnector,
  CONTRACT_VERSION,
  type Customer,
  type SignInMode,
} from "@gifting/commerce";

export type MemoryOptions = {
  /** Default "password". */
  signIn?: SignInMode;
  /** Whether it keeps its own session for a signed-in customer, like commercetools' tokens. Default true. */
  platformSessions?: boolean;
  /** Items to sell. Without them the connector has no catalog, and the product serves its demo one. */
  catalog?: CatalogItem[];
};

/** A catalog searched in memory, by the same rules a platform's search applies. */
export function memoryCatalog(items: readonly CatalogItem[]): CatalogConnector {
  const copy = (item: CatalogItem): CatalogItem => ({ ...item, tags: [...item.tags], variants: item.variants.map((v) => ({ ...v })) });
  return {
    listItems: async () => items.map(copy),
    async searchItems({ tags, brands, skus, budgetCents }) {
      const anyRule = tags.length + brands.length + skus.length > 0;
      return items.flatMap((item) => {
        const fits = item.variants.filter(
          (v) =>
            v.available &&
            v.priceCents <= budgetCents &&
            (!anyRule || skus.includes(v.sku) || brands.includes(item.brand) || item.tags.some((t) => tags.includes(t))),
        );
        return fits.length ? [{ key: item.key, skus: fits.map((v) => v.sku) }] : [];
      });
    },
    getItem: async (sku) => {
      const item = items.find((i) => i.variants.some((v) => v.sku === sku));
      return item ? copy(item) : null;
    },
  };
}

type Stored = Customer & { password: string | null };

export function createMemoryConnector(options: MemoryOptions = {}) {
  const signIn = options.signIn ?? "password";
  const platformSessions = options.platformSessions ?? true;
  const customers = new Map<string, Stored>();
  const sessions = new Set<string>();
  const codes = new Map<string, string>();
  const calls = { signIns: 0, endedSessions: [] as string[] };
  let n = 0;

  const strip = ({ password: _password, ...customer }: Stored): Customer => ({ ...customer });
  const byEmail = (email: string) => [...customers.values()].find((c) => c.email === email.toLowerCase());
  const newSession = () => {
    if (!platformSessions) return {};
    const id = `memory-session-${++n}`;
    sessions.add(id);
    return { platformSession: id };
  };

  const connector: CommerceConnector = {
    id: "memory",
    contractVersion: CONTRACT_VERSION,
    capabilities: { signIn },
    ...(options.catalog ? { catalog: memoryCatalog(options.catalog) } : {}),
    accounts: {
      ...(signIn === "password"
        ? {
            async register(input) {
              if (byEmail(input.email)) return { duplicate: true as const };
              const customer: Stored = {
                id: crypto.randomUUID(),
                email: input.email.toLowerCase(),
                firstName: input.firstName,
                lastName: input.lastName,
                companyName: input.companyName ?? null,
                emailVerified: false,
                hasPassword: true,
                password: input.password,
              };
              customers.set(customer.id, customer);
              return { customer: strip(customer) };
            },
            async signInWithPassword(email: string, password: string) {
              calls.signIns += 1;
              const customer = byEmail(email);
              if (!customer || customer.password === null || customer.password !== password) return null;
              return { customerId: customer.id, ...newSession() };
            },
          }
        : {
            hostedSignIn: {
              async start({ state, redirectUri, loginHint }) {
                const url = new URL(redirectUri);
                url.searchParams.set("state", state);
                if (!loginHint) {
                  url.searchParams.set("error", "login_hint_required");
                  return url.toString();
                }
                const code = `memory-code-${++n}`;
                codes.set(code, loginHint.toLowerCase());
                url.searchParams.set("code", code);
                return url.toString();
              },
              async finish({ code }) {
                const email = codes.get(code);
                if (!email) return null;
                codes.delete(code);
                // The platform's page proved the email, and creates the customer on first sign-in.
                let customer = byEmail(email);
                if (!customer) {
                  customer = { id: crypto.randomUUID(), email, firstName: null, lastName: null, companyName: null, emailVerified: true, hasPassword: false, password: null };
                  customers.set(customer.id, customer);
                }
                return { customerId: customer.id, ...newSession() };
              },
            },
          }),
      async findByEmail(email) {
        const customer = byEmail(email);
        return customer ? strip(customer) : null;
      },
      async get(id) {
        const customer = customers.get(id);
        return customer ? strip(customer) : null;
      },
      async markEmailVerified(id) {
        const customer = customers.get(id);
        if (!customer) return null;
        customer.emailVerified = true;
        return strip(customer);
      },
      ...(platformSessions
        ? {
            async renewPlatformSession(session: string) {
              if (!sessions.delete(session)) return null;
              return newSession().platformSession ?? null;
            },
            async endPlatformSession(session: string) {
              sessions.delete(session);
              calls.endedSessions.push(session);
            },
          }
        : {}),
    },
  };

  return {
    connector,
    /** What the product asked of the platform, for tests. */
    calls,
    /** A record without a password (like an older import); it can't sign in with one. */
    addPasswordless(email: string): Customer {
      const customer: Stored = { id: crypto.randomUUID(), email: email.toLowerCase(), firstName: null, lastName: null, companyName: null, emailVerified: false, hasPassword: false, password: null };
      customers.set(customer.id, customer);
      return strip(customer);
    },
    /** For the conformance suite: reads the code from the URL the hosted page "redirects" to. */
    async completeHostedSignIn(url: string): Promise<string> {
      return new URL(url).searchParams.get("code") ?? "";
    },
  };
}
