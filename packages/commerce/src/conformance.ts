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

import { type CommerceConnector, connectorProblem } from "./contract";

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
