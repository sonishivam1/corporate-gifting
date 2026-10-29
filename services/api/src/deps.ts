import { type ChannelRegistry, createChannelRegistry, emailChannel, logChannel, smtpTransport } from "@gifting/channels";
import { getClient, getDb } from "@gifting/db";
import type { Logger } from "@gifting/logger";
import { OrderError, type OrderPlacer } from "@gifting/domain";
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
  // Creates the commerce order when a gift is redeemed. Defaults to refusing: order creation is off.
  orders?: OrderPlacer;
  // Percent of the gift budget held on top, as an estimate for shipping and tax. Defaults to none.
  giftEstimatePercent?: number;
  // Optional: logs delivery problems. Ids and codes only, never recipient details.
  log?: Logger;
};

/** The database is opened on first use, so building the app (and `pnpm build`) never connects. */
/** Order creation is off until a connector provides it: redeeming a gift then says so plainly instead of pretending. */
export const ordersOff: OrderPlacer = {
  async place() {
    throw new OrderError("not_supported", "Order creation is off. Set COMMERCE_CONNECTOR to a platform that creates orders (commercetools).");
  },
  async find() {
    return null;
  },
};

/** SMTP_URL set: the email channel over SMTP (the local inbox, or a provider). Unset: the log channel, which sends nothing. */
function defaultChannels(env: Record<string, string | undefined>): ChannelRegistry {
  const email = env.SMTP_URL
    ? emailChannel({ transport: smtpTransport(env.SMTP_URL), from: env.MAIL_FROM ?? "Digital Gifting <gifts@digital-gifting.example>" })
    : logChannel("email");
  return createChannelRegistry([email]);
}

/** GIFT_ESTIMATE_PERCENT: 0 to 100. A bad value stops the API at start, not at the first send. */
function estimatePercent(env: Record<string, string | undefined>): number {
  const raw = env.GIFT_ESTIMATE_PERCENT;
  if (raw === undefined || raw === "") return 0;
  const value = Number(raw);
  if (!(value >= 0 && value <= 100)) throw new Error("GIFT_ESTIMATE_PERCENT must be a number from 0 to 100.");
  return value;
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
    giftEstimatePercent: estimatePercent(env),
  };
}
