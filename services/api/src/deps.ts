import { type ChannelRegistry, createChannelRegistry, emailChannel, logChannel, smtpTransport } from "@gifting/channels";
import { getClient, getDb } from "@gifting/db";
import type { Logger } from "@gifting/logger";
import type { Db, MongoClient } from "mongodb";

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

/** The database is opened on first use, so building the app (and `pnpm build`) never connects. */
/** SMTP_URL set: the email channel over SMTP (the local inbox, or a provider). Unset: the log channel, which sends nothing. */
function defaultChannels(env: Record<string, string | undefined>): ChannelRegistry {
  const email = env.SMTP_URL
    ? emailChannel({ transport: smtpTransport(env.SMTP_URL), from: env.MAIL_FROM ?? "Digital Gifting <gifts@digital-gifting.example>" })
    : logChannel("email");
  return createChannelRegistry([email]);
}

export function defaultDeps(env: Record<string, string | undefined> = process.env): AppDeps {
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
    channels: defaultChannels(env),
  };
}
