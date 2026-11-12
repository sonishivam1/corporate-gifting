import { assertTestDb, getCollections, testDbName } from "@gifting/db";
import { writeDemoData } from "@gifting/seed/write-demo";
import type { FastifyInstance } from "fastify";
import { type Db, MongoClient } from "mongodb";

import { buildApp } from "../../src/app";
import type { AppDeps } from "../../src/deps";
import { seedOrg } from "../../src/modules/accounts/org";
import { seedCatalog } from "../../src/modules/catalog/source";

/** 28 Oct 2026, the same "today" the demo uses. */
export const NOW = new Date("2026-10-28T10:00:00Z");

export type Harness = {
  app: FastifyInstance;
  db: Db;
  c: ReturnType<typeof getCollections>;
  close: () => Promise<void>;
};

/**
 * A fresh gifting_test_* database with the demo data, and the API on top of
 * it. assertTestDb() refuses any other database name before anything is
 * written; the database is dropped afterwards.
 */
export async function startHarness(extra: Partial<AppDeps> = {}): Promise<Harness> {
  const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017/?directConnection=true");
  await waitForPrimary(client);
  const name = testDbName();
  assertTestDb(name);
  const db = client.db(name);
  await writeDemoData(db, NOW);
  const app = await buildApp({
    deps: { client, db, catalog: seedCatalog, org: seedOrg, devAuth: true, recipientBaseUrl: "http://gifts.test", now: () => NOW, ...extra },
  });
  await app.ready();
  return {
    app,
    db,
    c: getCollections(db),
    close: async () => {
      await app.close();
      assertTestDb(db.databaseName);
      await db.dropDatabase();
      await client.close();
    },
  };
}

/**
 * Atlas Local answers pings before its replica set has elected a primary,
 * and writes fail until it has. Wait for it (up to a minute).
 */
async function waitForPrimary(client: MongoClient): Promise<void> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const hello = await client
      .db("admin")
      .command({ hello: 1 })
      .catch(() => null);
    if (hello?.isWritablePrimary) return;
    if (Date.now() > deadline) throw new Error("MongoDB has no writable primary. Is it running (pnpm db:up)?");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export const MAYA = { "x-dev-user": "user-maya", "x-gifting-team": "team-lumen-people" };
export const MAYA_SALES = { "x-dev-user": "user-maya", "x-gifting-team": "team-lumen-sales" };
export const ROWAN = { "x-dev-user": "user-rowan" };
export const IMANI = { "x-dev-user": "user-imani" };
/** The demo company's owner (every team; may send and approve) and admin (every team; may send, never approve). */
export const DANA = { "x-dev-user": "user-dana", "x-gifting-team": "team-lumen-people" };
export const DANA_SALES = { "x-dev-user": "user-dana", "x-gifting-team": "team-lumen-sales" };
export const THEO = { "x-dev-user": "user-theo", "x-gifting-team": "team-lumen-people" };

export const people = (n: number) => Array.from({ length: n }, (_, i) => `rcp-lumen-${String(i + 1).padStart(2, "0")}`);

export function send(overrides: Record<string, unknown> = {}) {
  return {
    gift: { kind: "collection", collectionId: "col-treats", budgetCents: 5000 },
    greeting: { occasion: "thanks", cover: "confetti", headline: "Thank you!", fromName: "Maya Chen" },
    message: "Thanks for everything you put into this quarter.",
    recipientIds: people(3),
    newEmails: [],
    channels: ["email"],
    sendAt: null,
    expiresInDays: 60,
    reminders: true,
    ...overrides,
  };
}

/** Creates a draft and submits it; returns both responses. */
export async function createAndSubmit(app: FastifyInstance, headers: Record<string, string>, body = send()) {
  const created = await app.inject({ method: "POST", url: "/v1/campaigns", headers, payload: body });
  if (created.statusCode !== 201) return { created, submitted: null, id: null };
  const id = created.json().id as string;
  const submitted = await app.inject({ method: "POST", url: `/v1/campaigns/${id}/submit`, headers });
  return { created, submitted, id };
}
