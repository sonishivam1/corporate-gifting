import { AppError, createLogger } from "@gifting/logger";
import { type Db, MongoClient } from "mongodb";
import { z } from "zod";

import { collections, type Collections } from "./collections";
import { INDEXES } from "./indexes";

const env = z.object({
  MONGODB_URI: z.string({ error: "MONGODB_URI is not set." }).min(1, "MONGODB_URI is not set."),
  MONGODB_DB: z.string().min(1).default("gifting"),
});

let client: MongoClient | null = null;

/** Reads the connection settings. Errors name the variable, never its value. */
export function dbConfig(source: Record<string, string | undefined> = process.env) {
  const parsed = env.safeParse(source);
  if (!parsed.success) throw new AppError("config_invalid", parsed.error.issues.map((i) => i.message).join(" "));
  return { uri: parsed.data.MONGODB_URI, dbName: parsed.data.MONGODB_DB };
}

/** One client per process. */
export function getClient(): MongoClient {
  // Give up on an unreachable server after 5 seconds, not the driver's 30, so a stopped database says so quickly.
  client ??= new MongoClient(dbConfig().uri, { appName: "corporate-gifting-marketplace", serverSelectionTimeoutMS: 5000 });
  return client;
}

export function getDb(name = dbConfig().dbName): Db {
  return getClient().db(name);
}

export function getCollections(db: Db = getDb()): Collections {
  return collections(db);
}

export async function closeClient(): Promise<void> {
  await client?.close();
  client = null;
}

/** Creates every index in INDEXES. Safe to run repeatedly. */
export async function ensureIndexes(db: Db): Promise<void> {
  const log = createLogger("db", { db: db.databaseName });
  for (const [name, indexes] of Object.entries(INDEXES)) {
    if (indexes.length === 0) continue;
    await db.collection(name).createIndexes(indexes);
    log.info({ collection: name, count: indexes.length }, "indexes ensured");
  }
}
