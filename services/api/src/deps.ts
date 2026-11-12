import { type ChannelRegistry, createChannelRegistry, emailChannel } from "@gifting/channels";
import type { CatalogConnector, OrganizationsConnector } from "@gifting/commerce";
import { getClient, getDb } from "@gifting/db";
import type { Logger } from "@gifting/logger";
import { OrderError, type OrderPlacer } from "@gifting/domain";
import type { Db, MongoClient } from "mongodb";

import type { Mailer } from "./mail/mailer";
import { orgDirectory, seedOrg, type OrgDirectory } from "./modules/accounts/org";
import { connectorCatalog } from "./modules/catalog/connector-source";
import { type CatalogSource, seedCatalog, seedOccasions } from "./modules/catalog/source";

/**
 * What the API runs against. Production wiring reads the environment;
 * integration tests pass a throwaway database instead.
 */
export type AppDeps = {
  client: MongoClient;
  db: Db;
  // The commerce connector's catalog, or the demo catalog (see catalogFor).
  catalog: CatalogSource;
  // Companies, teams and roles (ADR 0016): the connector's organizations, else
  // the demo company in development. Null: the dashboard answers 503.
  org: OrgDirectory | null;
  // Development sign-in (see http/session.ts). Never on in production.
  devAuth: boolean;
  recipientBaseUrl: string;
  now: () => Date;
  // Delivery channels by kind. Defaults to none registered: nothing is delivered.
  channels?: ChannelRegistry;
  // Creates the commerce order when a gift is redeemed. Defaults to refusing: order creation is off.
  orders?: OrderPlacer;
  // Percent of the gift budget held on top, as an estimate for shipping and tax. Defaults to none.
  giftEstimatePercent?: number;
  // Optional: logs delivery problems. Ids and codes only, never recipient details.
  log?: Logger;
};

/**
 * The commerce connector's catalog when it has one (ADR 0013), else the demo
 * catalog from `infra/seed`. Tests, CI and the build use the demo catalog and
 * need no platform.
 */
export function catalogFor(connector: CatalogConnector | null | undefined, log?: Logger): CatalogSource {
  if (!connector) return seedCatalog;
  return connectorCatalog({
    catalog: connector,
    fallbackOccasions: (sku) => seedOccasions.get(sku),
    onError: (err) => log?.error({ err }, "catalog read failed"),
  });
}

/**
 * The connector's organizations when it has them (ADR 0016). Without them,
 * development reads the demo company from `infra/seed`, and production has
 * none: every dashboard route answers `503 organizations_not_configured`.
 */
export function orgFor(organizations: OrganizationsConnector | null | undefined, devAuth: boolean): OrgDirectory | null {
  if (organizations) return orgDirectory(organizations);
  return devAuth ? seedOrg : null;
}

/** Order creation is off until a connector provides it: redeeming a gift then says so plainly instead of pretending. */
export const ordersOff: OrderPlacer = {
  async place() {
    throw new OrderError("not_supported", "Order creation is off. Set COMMERCE_CONNECTOR to a platform that creates orders (commercetools).");
  },
  async find() {
    return null;
  },
};

/** Gift emails go through the same mailer as account emails, so one setting decides where all email goes. */
function defaultChannels(mailer: Mailer): ChannelRegistry {
  return createChannelRegistry([emailChannel({ transport: { sendMail: (mail) => mailer.send(mail) } })]);
}

/** GIFT_ESTIMATE_PERCENT: 0 to 100. A bad value stops the API at start, not at the first send. */
function estimatePercent(env: Record<string, string | undefined>): number {
  const raw = env.GIFT_ESTIMATE_PERCENT;
  if (raw === undefined || raw === "") return 0;
  const value = Number(raw);
  if (!(value >= 0 && value <= 100)) throw new Error("GIFT_ESTIMATE_PERCENT must be a number from 0 to 100.");
  return value;
}

/**
 * The database is opened on first use, so building the app (and `pnpm build`)
 * never connects. With no mailer (tests that send nothing), no channel is
 * registered and gifts stay queued.
 */
export function defaultDeps(
  env: Record<string, string | undefined> = process.env,
  options: { log?: Logger; catalog?: CatalogConnector | null; mailer?: Mailer | null; organizations?: OrganizationsConnector | null } = {},
): AppDeps {
  const catalog = catalogFor(options.catalog, options.log);
  const devAuth = env.DEV_AUTH === "1" && env.NODE_ENV !== "production";
  return {
    get client() {
      return getClient();
    },
    get db() {
      return getDb();
    },
    catalog,
    org: orgFor(options.organizations, devAuth),
    devAuth,
    recipientBaseUrl: env.RECIPIENT_PUBLIC_URL ?? "http://localhost:3001",
    now: () => new Date(),
    giftEstimatePercent: estimatePercent(env),
    ...(options.mailer ? { channels: defaultChannels(options.mailer) } : {}),
    ...(options.log ? { log: options.log } : {}),
  };
}
