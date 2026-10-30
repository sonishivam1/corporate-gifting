import { createCtApi, loadCtApiConfig } from "@gifting/ct";
import { getClient, getDb } from "@gifting/db";
import { AppError, type Logger } from "@gifting/logger";
import type { Db, MongoClient } from "mongodb";

import { seedOrg, type OrgDirectory } from "./modules/accounts/org";
import { ctCatalog, ctReader } from "./modules/catalog/ct-source";
import { type CatalogSource, seedCatalog, seedOccasions } from "./modules/catalog/source";

/**
 * What the API runs against. Production wiring reads the environment;
 * integration tests pass a throwaway database instead.
 */
export type AppDeps = {
  client: MongoClient;
  db: Db;
  // The catalog comes from commercetools or the seed file (CATALOG_SOURCE).
  catalog: CatalogSource;
  // A stand-in for commercetools Business Units until M1.
  org: OrgDirectory;
  // Development sign-in (see http/session.ts). Never on in production.
  devAuth: boolean;
  recipientBaseUrl: string;
  now: () => Date;
};

const CATALOG_SOURCES = ["seed", "commercetools"] as const;

/**
 * `seed` (the default) needs no commercetools project, so tests, CI and the
 * build run without one. `commercetools` reads the project with the API's
 * own read-only client (`CTP_API_*`).
 */
export function catalogFromEnv(env: Record<string, string | undefined>, log?: Logger): CatalogSource {
  const name = env.CATALOG_SOURCE?.trim() || "seed";
  if (name === "seed") return seedCatalog;
  if (name !== "commercetools") {
    throw new AppError("config_invalid", `CATALOG_SOURCE must be one of ${CATALOG_SOURCES.join(", ")}.`);
  }
  return ctCatalog({
    reader: ctReader(createCtApi(loadCtApiConfig(env))),
    fallbackOccasions: (sku) => seedOccasions.get(sku),
    onError: (err) => log?.error({ err }, "commercetools catalog read failed"),
  });
}

/** The database is opened on first use, so building the app (and `pnpm build`) never connects. */
export function defaultDeps(env: Record<string, string | undefined> = process.env, log?: Logger): AppDeps {
  const catalog = catalogFromEnv(env, log);
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
  };
}
