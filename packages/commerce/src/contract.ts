/**
 * The commerce connector contract (ADR 0013, plan: commerce-connectors.md).
 *
 * The product talks to a commerce platform only through this contract, and a
 * deployment picks its platform with COMMERCE_CONNECTOR. A connector is a
 * package, `@gifting/commerce-<name>`, whose default export is a
 * `ConnectorFactory`. Taking the product to another platform means writing
 * that package once; the product's code never changes.
 *
 * Rules for the contract:
 * - no platform concepts cross it: no SDK types, stores, Business Units or
 *   platform tokens. What a platform keeps for a signed-in customer travels
 *   as an opaque `platformSession` string that only the connector reads;
 * - real differences between platforms are `capabilities`, which the product
 *   checks instead of a platform's name;
 * - it is versioned like the API: within a version, changes only add.
 *   Catalog, orders, payment and events join it with M2 and M4.
 */
import type { OrderPlacer } from "@gifting/domain";
import type { Logger } from "@gifting/logger";

/** The contract version this package defines. A connector built for it keeps working within it. */
export const CONTRACT_VERSION = 1;

/**
 * How people sign in on this platform:
 * - "password": our register and sign-in forms; the connector checks the password;
 * - "hosted": the platform's own sign-in page (for example Shopify's
 *   customer accounts, which send an email code). The platform verifies the
 *   email and creates the customer on first sign-in.
 */
export type SignInMode = "password" | "hosted";

export type ConnectorCapabilities = {
  signIn: SignInMode;
};

/** A customer as the product sees it, on any platform. */
export type Customer = {
  /** The platform's id for the customer. Stored with its connection, never alone. */
  id: string;
  /** Lowercase. */
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  emailVerified: boolean;
  /** False for records that can't sign in with a password (for example made by an older import). */
  hasPassword: boolean;
};

export type NewCustomer = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName?: string;
};

/** A successful sign-in. `platformSession` is the platform's own state, if it has any (opaque). */
export type PlatformSignIn = { customerId: string; platformSession?: string };

/** The platform's own sign-in page ("hosted" mode), as an OAuth-style redirect. */
export type HostedSignIn = {
  /** The page to send the person to. `loginHint` pre-fills their email where the platform allows it. */
  start(request: { state: string; redirectUri: string; loginHint?: string }): Promise<string>;
  /** Completes the sign-in from the code the platform returned. Null when the code is refused. */
  finish(request: { code: string; redirectUri: string }): Promise<PlatformSignIn | null>;
};

export type AccountsConnector = {
  /** Creates an unverified customer, or reports that the email is taken. ("password" mode) */
  register?(customer: NewCustomer): Promise<{ customer: Customer } | { duplicate: true }>;
  findByEmail(email: string): Promise<Customer | null>;
  /** Null for an unknown id, or a customer outside this deployment (another store or market). */
  get(id: string): Promise<Customer | null>;
  /** Records that the product verified this customer's email. Null for an unknown id. */
  markEmailVerified(id: string): Promise<Customer | null>;
  /** Checks a password. Null when the email or password is wrong. Works before verification; the product checks. ("password" mode) */
  signInWithPassword?(email: string, password: string): Promise<PlatformSignIn | null>;
  /** ("hosted" mode) */
  hostedSignIn?: HostedSignIn;
  /** Renews the platform's own session. Null when it has ended. Only for platforms that have one. */
  renewPlatformSession?(platformSession: string): Promise<string | null>;
  /** Ends the platform's own session (sign-out). */
  endPlatformSession?(platformSession: string): Promise<void>;
};

export type CommerceConnector = {
  /** The connector's name, as set in COMMERCE_CONNECTOR, for example "commercetools". */
  id: string;
  contractVersion: typeof CONTRACT_VERSION;
  capabilities: ConnectorCapabilities;
  accounts: AccountsConnector;
  /** Creates the order when a recipient chooses a gift, and finds it again. A platform without it cannot redeem gifts. */
  orders?: OrderPlacer;
  /** Checks settings and credentials before the API takes requests. Throws with a message that names no secret. */
  check?(): Promise<void>;
};

export type ConnectorContext = {
  /** The process environment; each connector reads its own settings from it. */
  env: Record<string, string | undefined>;
  log: Logger;
  production: boolean;
};

/** The default export of every connector package. */
export type ConnectorFactory = (context: ConnectorContext) => CommerceConnector | Promise<CommerceConnector>;

export function defineConnector(factory: ConnectorFactory): ConnectorFactory {
  return factory;
}

/** Why a connector can't serve this product, or null when it can. */
export function connectorProblem(connector: CommerceConnector): string | null {
  if (connector.contractVersion !== CONTRACT_VERSION) return `The ${connector.id} connector is built for contract version ${String(connector.contractVersion)}; this product uses ${CONTRACT_VERSION}.`;
  const { accounts, capabilities } = connector;
  if (capabilities.signIn === "password" && !(accounts.signInWithPassword && accounts.register)) return `The ${connector.id} connector says it signs in with a password but lacks register or signInWithPassword.`;
  if (capabilities.signIn === "hosted" && !accounts.hostedSignIn) return `The ${connector.id} connector says it uses a hosted sign-in page but has no hostedSignIn.`;
  if (Boolean(accounts.renewPlatformSession) !== Boolean(accounts.endPlatformSession)) return `The ${connector.id} connector must have both renewPlatformSession and endPlatformSession, or neither.`;
  return null;
}
