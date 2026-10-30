import path from "node:path";

import { dbConfig, getDb } from "@gifting/db";
import { AppError, createLogger } from "@gifting/logger";
import { z } from "zod";

import { buildApp } from "./app";
import { loadConnector } from "./commerce/load";
import { defaultDeps } from "./deps";
import { createMailer, type Mailer } from "./mail/mailer";
import { type AccountsService, createAccountsService } from "./modules/accounts/service";

const log = createLogger("api");
const env = z
  .object({
    API_PORT: z.coerce.number().int().positive().default(4000),
    SENDER_PUBLIC_URL: z.url().default("http://localhost:3000"),
    SMTP_URL: z.string().optional(),
    // The same server as separate settings; used instead of SMTP_URL when SMTP_HOST is set.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default("Gifting <no-reply@gifting.example>"),
    OPS_EMAILS: z.string().default(""),
    API_SESSION_SECRET: z.string().optional(),
  })
  .parse(process.env);

let accounts: AccountsService | null = null;
let mailer: Mailer;
try {
  const production = process.env.NODE_ENV === "production";
  const smtp = env.SMTP_HOST ? { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER || undefined, pass: env.SMTP_PASS || undefined } : env.SMTP_URL || undefined;
  mailer = createMailer({ smtp, from: env.MAIL_FROM, outboxDir: path.resolve(import.meta.dirname, "../../../.data/outbox"), production, log });
  // The commerce platform is a plug-in: COMMERCE_CONNECTOR names it, and it reads its own settings.
  const connector = await loadConnector({ env: process.env, log, production });
  if (connector) {
    if (!env.API_SESSION_SECRET) throw new AppError("config_invalid", "API_SESSION_SECRET is not set (openssl rand -hex 32).");
    accounts = createAccountsService({
      connector,
      mailer,
      appUrl: env.SENDER_PUBLIC_URL.replace(/\/$/, ""),
      log,
      sessionSecret: env.API_SESSION_SECRET,
      opsEmails: env.OPS_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
    });
    log.info({ connector: connector.id, signIn: connector.capabilities.signIn }, "sign-in configured");
  } else {
    log.warn("COMMERCE_CONNECTOR is not set: register and sign-in answer 503.");
  }
} catch (err) {
  log.fatal({ err }, "API configuration is invalid");
  process.exit(1);
}

const app = await buildApp({ logger: log, accounts, deps: defaultDeps(process.env, { mailer, log }) });

try {
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
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
