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
 *   The catalog joined with M2 (optional, so v1 connectors without it still
 *   work); orders, payment and events join it with M4; organizations
 *   (ADR 0016) joined in Nov 2026, also optional.
 */
import type { Membership, OrderPlacer } from "@gifting/domain";
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

/** One orderable version of a catalog item (a size, flavour or colour). */
export type CatalogVariant = {
  sku: string;
  /** What tells it apart from the item's other variants; empty when it is the only one. */
  label: string;
  /** In the market's currency, as integer cents. */
  priceCents: number;
  /** In stock at the vendor that ships it. */
  available: boolean;
  imageUrl: string | null;
};

/**
 * A product as the product sees it, on any platform. Vendors are named by
 * key; how a platform models them (supply channels, locations) stays inside
 * the connector.
 */
export type CatalogItem = {
  /** The platform's stable key for the product. */
  key: string;
  name: string;
  brand: string;
  description: string;
  tags: string[];
  vendorKey: string;
  vendorName: string;
  /** Days from order to dispatch. */
  slaDays: number;
  /** ISO 4217, for example "USD". */
  currency: string;
  /** Variants with a price in the market; at least one. */
  variants: CatalogVariant[];
};

/** A collection's rules at a budget: any of the tags, brands or SKUs (everything when all are empty). */
export type CatalogSearch = {
  tags: string[];
  brands: string[];
  skus: string[];
  /** Only variants that cost no more than this, and are in stock at their vendor. */
  budgetCents: number;
};

/** An item a search matched, and which of its variants (null when all did). */
export type CatalogMatch = { key: string; skus: string[] | null };

export type CatalogConnector = {
  /** Every item on sale in the deployment's market. The product caches this for a short while. */
  listItems(): Promise<CatalogItem[]>;
  /** The items a collection offers: what matches its rules, fits the budget and is in stock. */
  searchItems(search: CatalogSearch): Promise<CatalogMatch[]>;
  /** The item that has this SKU, read live (estimates and sends price from it). Null when unknown. */
  getItem(sku: string): Promise<CatalogItem | null>;
};

/** A customer company. `key` is the product's stable key, never a platform id. */
export type OrgCompany = { key: string; name: string };

/** A team of a company. `approvalThresholdCents` is null when the team has none set. */
export type OrgTeam = { key: string; name: string; approvalThresholdCents: number | null };

/** A person in a company: the customer's id and their memberships in that company only. */
export type OrgMember = { id: string; name: string; memberships: Membership[] };

/**
 * Which companies and teams a customer belongs to, and with which role
 * (ADR 0016). Roles are the product's four: `owner` and `admin` held on the
 * company (no `teamKey`), `approver` and `sender` held on one team. A
 * connector maps its platform's roles to these and drops any other; what a
 * role may do is the product's own map, never the platform's.
 */
export type OrganizationsConnector = {
  /** Every role the customer holds, in every company. Empty for an unknown customer. */
  membershipsOf(customerId: string): Promise<Membership[]>;
  /** Null for an unknown key. */
  company(companyKey: string): Promise<OrgCompany | null>;
  /** The company's teams, in display order. Empty for an unknown company. */
  teams(companyKey: string): Promise<OrgTeam[]>;
  /** Everyone with a role in the company or one of its teams. Empty for an unknown company. */
  members(companyKey: string): Promise<OrgMember[]>;
};

export type CommerceConnector = {
  /** The connector's name, as set in COMMERCE_CONNECTOR, for example "commercetools". */
  id: string;
  contractVersion: typeof CONTRACT_VERSION;
  capabilities: ConnectorCapabilities;
  accounts: AccountsConnector;
  /** Products, prices and stock. Without it, the product serves its demo catalog. */
  catalog?: CatalogConnector;
  /** Creates the order when a recipient chooses a gift, and finds it again. A platform without it cannot redeem gifts. */
  orders?: OrderPlacer;
  /** Companies, teams and roles. Without it, production refuses the dashboard (ADR 0016). */
  organizations?: OrganizationsConnector;
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
