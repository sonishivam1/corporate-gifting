import { type ChannelRegistry, createChannelRegistry, emailChannel } from "@gifting/channels";
import { getClient, getDb } from "@gifting/db";
import type { Logger } from "@gifting/logger";
import type { Db, MongoClient } from "mongodb";

import type { Mailer } from "./mail/mailer";
import { seedOrg, type OrgDirectory } from "./modules/accounts/org";
import { seedCatalog, type CatalogSource } from "./modules/catalog/source";

/**
 * What the API runs against. Production wiring reads the environment;
 * integration tests pass a throwaway database instead.
 */
export type AppDeps = {
  client: MongoClient;
  db: Db;
  // Stand-ins for commercetools until M1 (Business Units) and M2 (product search).
  catalog: CatalogSource;
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

/** Gift emails go through the same mailer as account emails, so one setting decides where all email goes. */
function defaultChannels(mailer: Mailer): ChannelRegistry {
  return createChannelRegistry([emailChannel({ transport: { sendMail: (mail) => mailer.send(mail) } })]);
}

/**
 * The database is opened on first use, so building the app (and `pnpm build`)
 * never connects. With no mailer (tests that send nothing), no channel is
 * registered and gifts stay queued.
 */
export function defaultDeps(env: Record<string, string | undefined> = process.env, wiring: { mailer?: Mailer; log?: Logger } = {}): AppDeps {
  return {
    get client() {
      return getClient();
    },
    get db() {
      return getDb();
    },
    catalog: seedCatalog,
    org: seedOrg,
    devAuth: env.DEV_AUTH === "1" && env.NODE_ENV !== "production",
    recipientBaseUrl: env.RECIPIENT_PUBLIC_URL ?? "http://localhost:3001",
    now: () => new Date(),
    ...(wiring.mailer ? { channels: defaultChannels(wiring.mailer) } : {}),
    ...(wiring.log ? { log: wiring.log } : {}),
  };
}
