import path from "node:path";

import { createCtApi, loadCtConfig } from "@gifting/ct";
import { createLogger } from "@gifting/logger";
import { z } from "zod";

import { buildApp } from "./app";
import { createMailer } from "./mail/mailer";
import { createCtIdentity, loadSignInClientConfig } from "./modules/accounts/ct-identity";
import { type AccountsService, createAccountsService } from "./modules/accounts/service";

const log = createLogger("api");
const env = z
  .object({
    API_PORT: z.coerce.number().int().positive().default(4000),
    SENDER_PUBLIC_URL: z.url().default("http://localhost:3000"),
    SMTP_URL: z.string().optional(),
    // Separate SMTP settings (for example Brevo); used instead of SMTP_URL when SMTP_HOST is set.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default("Gifting <no-reply@gifting.example>"),
    OPS_EMAILS: z.string().default(""),
  })
  .parse(process.env);

let accounts: AccountsService | null = null;
try {
  const signIn = loadSignInClientConfig();
  if (signIn) {
    const ct = loadCtConfig();
    const identity = createCtIdentity({ api: createCtApi(ct), authUrl: ct.authUrl, projectKey: ct.projectKey, storeKey: ct.storeKey, signIn });
    // Refuse to start with an admin client: its customer tokens would carry full project access.
    await identity.assertSignInClientScopes();
    const production = process.env.NODE_ENV === "production";
    const smtp = env.SMTP_HOST ? { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER || undefined, pass: env.SMTP_PASS || undefined } : env.SMTP_URL || undefined;
    const mailer = createMailer({ smtp, from: env.MAIL_FROM, outboxDir: path.resolve(import.meta.dirname, "../../../.data/outbox"), production, log });
    accounts = createAccountsService({
      identity,
      mailer,
      appUrl: env.SENDER_PUBLIC_URL.replace(/\/$/, ""),
      log,
      opsEmails: env.OPS_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
    });
    log.info({ storeKey: ct.storeKey }, "sign-in configured");
  } else {
    log.warn("CTP_SIGNIN_CLIENT_ID and CTP_SIGNIN_CLIENT_SECRET are not set: register and sign-in answer 503.");
  }
} catch (err) {
  log.fatal({ err }, "API configuration is invalid");
  process.exit(1);
}

const app = await buildApp({ logger: log, accounts });

try {
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
} catch (err) {
  log.fatal({ err }, "API failed to start");
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
