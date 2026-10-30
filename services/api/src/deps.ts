import { type ChannelRegistry, createChannelRegistry, emailChannel } from "@gifting/channels";
import type { CatalogConnector } from "@gifting/commerce";
import { getClient, getDb } from "@gifting/db";
import type { Logger } from "@gifting/logger";
import type { Db, MongoClient } from "mongodb";

import type { Mailer } from "./mail/mailer";
import { seedOrg, type OrgDirectory } from "./modules/accounts/org";
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
  // A stand-in for commercetools Business Units until M1.
  org: OrgDirectory;
  // Development sign-in (see http/session.ts). Never on in production.
  devAuth: boolean;
  recipientBaseUrl: string;
  now: () => Date;
  // Delivery channels by kind. Defaults to none registered: nothing is delivered.
  channels?: ChannelRegistry;
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

/** Gift emails go through the same mailer as account emails, so one setting decides where all email goes. */
function defaultChannels(mailer: Mailer): ChannelRegistry {
  return createChannelRegistry([emailChannel({ transport: { sendMail: (mail) => mailer.send(mail) } })]);
}

/**
 * The database is opened on first use, so building the app (and `pnpm build`)
 * never connects. With no mailer (tests that send nothing), no channel is
 * registered and gifts stay queued.
 */
export function defaultDeps(
  env: Record<string, string | undefined> = process.env,
  options: { log?: Logger; catalog?: CatalogConnector | null; mailer?: Mailer | null } = {},
): AppDeps {
  const catalog = catalogFor(options.catalog, options.log);
  return {
    get client() {
      return getClient();
    },
    get db() {
      return getDb();
    },
    catalog,
    org: seedOrg,
    devAuth: env.DEV_AUTH === "1" && env.NODE_ENV !== "production",
    recipientBaseUrl: env.RECIPIENT_PUBLIC_URL ?? "http://localhost:3001",
    now: () => new Date(),
    ...(options.mailer ? { channels: defaultChannels(options.mailer) } : {}),
    ...(options.log ? { log: options.log } : {}),
  };
}
