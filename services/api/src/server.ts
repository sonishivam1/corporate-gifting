import { dbConfig, getDb } from "@gifting/db";
import { createLogger } from "@gifting/logger";
import { z } from "zod";

import { buildApp } from "./app";

const log = createLogger("api");
const port = z.coerce.number().int().positive().default(4000).parse(process.env.API_PORT);

const app = await buildApp({ logger: log });

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  log.fatal({ err }, "API failed to start");
  process.exit(1);
}

/** Only the host, never the full connection string (it can hold a password). */
function dbHost(): string {
  try {
    return new URL(dbConfig().uri).host || "the configured host";
  } catch {
    return "the configured host";
  }
}

// A missing database shouldn't stop /health, but it should say so plainly.
try {
  await Promise.race([
    getDb().command({ ping: 1 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), 3000)),
  ]);
  log.info("MongoDB reachable");
} catch {
  log.warn({ host: dbHost() }, "MongoDB is not reachable; run pnpm db:up (or pnpm dev:all)");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
