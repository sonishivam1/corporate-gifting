import { getClient, getDb } from "@gifting/db";
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
};

/** The database is opened on first use, so building the app (and `pnpm build`) never connects. */
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
  };
}
