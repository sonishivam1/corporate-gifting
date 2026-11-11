/**
 * The conformance suite: what "plug and play" means. A connector that passes
 * it works with the product. Every connector package runs it, against
 * memory in `pnpm test` or against a sandbox of its platform in
 * `pnpm test:conformance`.
 *
 *   describeConnectorConformance("my platform", { connector, newEmail, cleanup });
 *
 * Test files only: this module imports vitest.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isCompanyRole, MEMBER_ROLES } from "@gifting/domain";

import { type CatalogItem, type CommerceConnector, connectorProblem } from "./contract";

export type ConformanceOptions = {
  /** The connector under test. */
  connector: () => CommerceConnector | Promise<CommerceConnector>;
  /** A lowercase email that no customer has, different on every call. */
  newEmail: () => string;
  /** Deletes the customers the run created (needed on real platforms). */
  cleanup?: (customerIds: string[]) => Promise<void>;
  /**
   * "hosted" mode: goes through the platform's sign-in page as a person
   * would, and returns the code it redirects back with. Without it, only the
   * refusal checks run for hosted sign-in.
   */
  completeHostedSignIn?: (url: string, email: string) => Promise<string>;
  /**
   * Connectors with `organizations`: a customer who holds at least one role.
   * Without it, only the checks for unknown customers and companies run.
   */
  organizations?: { customerId: () => string | Promise<string> };
  /** Per-test timeout; real platforms need a few seconds. */
  timeoutMs?: number;
};

const PASSWORD = "Conformance-Check-2026!";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const REDIRECT = "http://localhost:3000/auth/callback";

export function describeConnectorConformance(name: string, options: ConformanceOptions): void {
  const created: string[] = [];
  let connector: CommerceConnector;
  const timeout = options.timeoutMs ?? 5_000;

  describe(`${name}: commerce connector conformance`, () => {
    beforeAll(async () => {
      connector = await options.connector();
      await connector.check?.();
    }, timeout * 2);

    afterAll(async () => {
      if (created.length > 0) await options.cleanup?.(created);
    }, timeout * 4);

    it("declares a contract version and capabilities it fulfils", () => {
      expect(connectorProblem(connector)).toBeNull();
    });

    it("answers unknown ids and emails with null", { timeout }, async () => {
      expect(await connector.accounts.get(UNKNOWN_ID)).toBeNull();
      expect(await connector.accounts.findByEmail(options.newEmail())).toBeNull();
      expect(await connector.accounts.markEmailVerified(UNKNOWN_ID)).toBeNull();
    });

    describe("password sign-in", () => {
      async function registered(email = options.newEmail()) {
        const result = await connector.accounts.register!({ email, password: PASSWORD, firstName: "Ada", lastName: "Lovelace", companyName: "Analytical Engines" });
        if (!("customer" in result)) throw new Error("register reported a duplicate for a new email");
        created.push(result.customer.id);
        return result.customer;
      }

      it("registers an unverified customer with a password, and finds it by email and id", { timeout }, async (ctx) => {
        if (connector.capabilities.signIn !== "password") return ctx.skip();
        const email = options.newEmail();
        const customer = await registered(email);
        expect(customer).toMatchObject({ email, firstName: "Ada", lastName: "Lovelace", companyName: "Analytical Engines", emailVerified: false, hasPassword: true });
        expect((await connector.accounts.findByEmail(email))?.id).toBe(customer.id);
        expect((await connector.accounts.get(customer.id))?.email).toBe(email);
      });

      it("reports a taken email as a duplicate", { timeout }, async (ctx) => {
        if (connector.capabilities.signIn !== "password") return ctx.skip();
        const customer = await registered();
        expect(await connector.accounts.register!({ email: customer.email, password: PASSWORD, firstName: "Someone", lastName: "Else" })).toEqual({ duplicate: true });
      });

      it("accepts the right password and refuses a wrong one or an unknown email", { timeout }, async (ctx) => {
        if (connector.capabilities.signIn !== "password") return ctx.skip();
        const customer = await registered();
        const signIn = connector.accounts.signInWithPassword!;
        const ok = await signIn(customer.email, PASSWORD);
        expect(ok?.customerId).toBe(customer.id);
        if (ok?.platformSession) await connector.accounts.endPlatformSession?.(ok.platformSession);
        expect(await signIn(customer.email, `${PASSWORD}x`)).toBeNull();
        expect(await signIn(options.newEmail(), PASSWORD)).toBeNull();
      });

      it("records a verified email", { timeout }, async (ctx) => {
        if (connector.capabilities.signIn !== "password") return ctx.skip();
        const customer = await registered();
        expect((await connector.accounts.markEmailVerified(customer.id))?.emailVerified).toBe(true);
        expect((await connector.accounts.get(customer.id))?.emailVerified).toBe(true);
      });

      it("renews its own session until it is ended (platforms that have one)", { timeout }, async (ctx) => {
        if (connector.capabilities.signIn !== "password" || !connector.accounts.renewPlatformSession) return ctx.skip();
        const customer = await registered();
        const session = (await connector.accounts.signInWithPassword!(customer.email, PASSWORD))?.platformSession;
        expect(typeof session).toBe("string");
        const renewed = await connector.accounts.renewPlatformSession(session!);
        expect(typeof renewed).toBe("string");
        await connector.accounts.endPlatformSession!(renewed!);
        expect(await connector.accounts.renewPlatformSession(renewed!)).toBeNull();
      });
    });

    describe("catalog (connectors that have one)", () => {
      const variants = (items: CatalogItem[]) => items.flatMap((item) => item.variants.map((variant) => ({ item, variant })));

      it("lists items with priced variants and unique SKUs", { timeout }, async (ctx) => {
        if (!connector.catalog) return ctx.skip();
        const items = await connector.catalog.listItems();
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
          expect(item.variants.length, item.key).toBeGreaterThan(0);
          for (const v of item.variants) expect(Number.isInteger(v.priceCents) && v.priceCents >= 0, v.sku).toBe(true);
        }
        const skus = variants(items).map(({ variant }) => variant.sku);
        expect(new Set(skus).size).toBe(skus.length);
      });

      it("reads one SKU, and answers an unknown one with null", { timeout }, async (ctx) => {
        if (!connector.catalog) return ctx.skip();
        const [first] = variants(await connector.catalog.listItems());
        const item = await connector.catalog.getItem(first!.variant.sku);
        expect(item?.key).toBe(first!.item.key);
        expect(item?.variants.some((v) => v.sku === first!.variant.sku)).toBe(true);
        expect(await connector.catalog.getItem(`no-such-sku-${UNKNOWN_ID}`)).toBeNull();
      });

      it("searches exactly what fits the budget and is in stock", { timeout: timeout * 3 }, async (ctx) => {
        if (!connector.catalog) return ctx.skip();
        const all = variants(await connector.catalog.listItems());
        const prices = all.map(({ variant }) => variant.priceCents).sort((a, b) => a - b);
        const budgetCents = prices[Math.floor(prices.length / 2)]!;
        const expected = all.filter(({ variant }) => variant.available && variant.priceCents <= budgetCents).map(({ variant }) => variant.sku).sort();
        const matches = await connector.catalog.searchItems({ tags: [], brands: [], skus: [], budgetCents });
        const byKey = new Map(all.map(({ item }) => [item.key, item]));
        // A match without SKUs means all of the item's variants matched.
        const found = matches.flatMap((m) => m.skus ?? byKey.get(m.key)?.variants.map((v) => v.sku) ?? [`unknown item ${m.key}`]);
        expect([...new Set(found)].sort()).toEqual(expected);
      });

      it("matches a rule on one SKU", { timeout }, async (ctx) => {
        if (!connector.catalog) return ctx.skip();
        const all = variants(await connector.catalog.listItems());
        const pick = all.find(({ variant }) => variant.available);
        if (!pick) return ctx.skip();
        const matches = await connector.catalog.searchItems({ tags: [], brands: [], skus: [pick.variant.sku], budgetCents: pick.variant.priceCents });
        expect(matches.map((m) => m.key)).toEqual([pick.item.key]);
      });
    });

    describe("organizations (connectors that have them)", () => {
      it("answers an unknown customer and company with nothing", { timeout }, async (ctx) => {
        const orgs = connector.organizations;
        if (!orgs) return ctx.skip();
        expect(await orgs.membershipsOf(UNKNOWN_ID)).toEqual([]);
        expect(await orgs.company(`no-such-company-${UNKNOWN_ID}`)).toBeNull();
        expect(await orgs.teams(`no-such-company-${UNKNOWN_ID}`)).toEqual([]);
        expect(await orgs.members(`no-such-company-${UNKNOWN_ID}`)).toEqual([]);
      });

      it("returns a member's companies, teams and roles in the product's shape", { timeout: timeout * 3 }, async (ctx) => {
        const orgs = connector.organizations;
        if (!orgs || !options.organizations) return ctx.skip();
        const customerId = await options.organizations.customerId();
        const memberships = await orgs.membershipsOf(customerId);
        expect(memberships.length).toBeGreaterThan(0);
        for (const m of memberships) {
          expect(MEMBER_ROLES).toContain(m.role);
          // Company roles are held on the company, team roles on a team.
          expect(Boolean(m.teamKey), `${m.companyKey} ${m.role}`).toBe(!isCompanyRole(m.role));
        }
        for (const companyKey of new Set(memberships.map((m) => m.companyKey))) {
          expect((await orgs.company(companyKey))?.key).toBe(companyKey);
          const teams = await orgs.teams(companyKey);
          const teamKeys = teams.map((t) => t.key);
          expect(new Set(teamKeys).size).toBe(teamKeys.length);
          for (const t of teams) expect(t.approvalThresholdCents === null || Number.isInteger(t.approvalThresholdCents), t.key).toBe(true);
          for (const m of memberships.filter((x) => x.companyKey === companyKey && x.teamKey)) expect(teamKeys).toContain(m.teamKey);
          const members = await orgs.members(companyKey);
          expect(members.map((m) => m.id)).toContain(customerId);
          // Nobody's roles in another company leak into this one.
          for (const member of members) for (const m of member.memberships) expect(m.companyKey, member.id).toBe(companyKey);
        }
      });
    });

    describe("hosted sign-in", () => {
      it("starts at the platform's page and refuses a made-up code", { timeout }, async (ctx) => {
        if (connector.capabilities.signIn !== "hosted") return ctx.skip();
        const url = await connector.accounts.hostedSignIn!.start({ state: "state-1", redirectUri: REDIRECT, loginHint: options.newEmail() });
        expect(() => new URL(url)).not.toThrow();
        expect(await connector.accounts.hostedSignIn!.finish({ code: "made-up", redirectUri: REDIRECT })).toBeNull();
      });

      it("signs a person in and returns a verified customer", { timeout }, async (ctx) => {
        if (connector.capabilities.signIn !== "hosted" || !options.completeHostedSignIn) return ctx.skip();
        const email = options.newEmail();
        const url = await connector.accounts.hostedSignIn!.start({ state: "state-2", redirectUri: REDIRECT, loginHint: email });
        const code = await options.completeHostedSignIn(url, email);
        const result = await connector.accounts.hostedSignIn!.finish({ code, redirectUri: REDIRECT });
        expect(result).not.toBeNull();
        created.push(result!.customerId);
        expect(await connector.accounts.get(result!.customerId)).toMatchObject({ email, emailVerified: true });
        expect(await connector.accounts.hostedSignIn!.finish({ code, redirectUri: REDIRECT })).toBeNull();
      });
    });
  });
}
