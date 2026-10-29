/**
 * Account emails (email verification). commercetools doesn't
 * send emails (ADR 0015), so the API does, over SMTP: SendGrid on GCP, or any
 * provider set in SMTP_URL or SMTP_HOST. Outside production, when no SMTP server answers, an
 * email is written to `.data/outbox` (gitignored) instead, so the flow works
 * without Docker. Emails are never logged: they hold addresses and links.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Logger } from "@gifting/logger";
import nodemailer from "nodemailer";

/** An image the HTML shows with `cid:<cid>` (attached inline; email clients block SVG and data: URLs). */
export type InlineImage = { cid: string; filename: string; contentType: string; content: Buffer };

export type Email = { to: string; subject: string; text: string; html: string; images?: InlineImage[] };

export type Mailer = { send(email: Email): Promise<void> };

/**
 * Writes each email as an .eml file (the text), plus an .html file to open in
 * a browser and see the design, for development and tests.
 */
export function outboxMailer(dir: string, from: string): Mailer {
  return {
    async send(email) {
      await mkdir(dir, { recursive: true });
      const base = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${email.subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);
      const message = [`From: ${from}`, `To: ${email.to}`, `Subject: ${email.subject}`, "Content-Type: text/plain; charset=utf-8", "", email.text, ""].join("\r\n");
      await writeFile(`${base}.eml`, message, "utf8");
      // In a browser the inline images can be data: URLs.
      const preview = (email.images ?? []).reduce((html, image) => html.replaceAll(`cid:${image.cid}`, `data:${image.contentType};base64,${image.content.toString("base64")}`), email.html);
      await writeFile(`${base}.html`, preview, "utf8");
    },
  };
}

/** An SMTP server, as a URL (`smtp://user:pass@host:587`) or as separate settings. */
export type SmtpSettings = string | { host: string; port: number; user?: string; pass?: string };

export function smtpMailer(smtp: SmtpSettings, from: string): Mailer {
  const transport =
    typeof smtp === "string"
      ? nodemailer.createTransport(smtp)
      : nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          // 465 is TLS from the start; 587 upgrades to TLS (STARTTLS).
          secure: smtp.port === 465,
          ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass ?? "" } } : {}),
        });
  return {
    async send(email) {
      await transport.sendMail({
        from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: (email.images ?? []).map((i) => ({ cid: i.cid, filename: i.filename, contentType: i.contentType, content: i.content, contentDisposition: "inline" as const })),
      });
    },
  };
}

/** SMTP, falling back to the outbox when SMTP can't be reached (never in production). */
export function createMailer(options: { smtp?: SmtpSettings; from: string; outboxDir: string; production: boolean; log: Logger }): Mailer {
  const outbox = outboxMailer(options.outboxDir, options.from);
  if (!options.smtp) {
    if (options.production) throw new Error("No SMTP server is set (SMTP_HOST or SMTP_URL).");
    options.log.warn({ outboxDir: options.outboxDir }, "No SMTP server is set: account emails go to the outbox folder");
    return outbox;
  }
  const smtp = smtpMailer(options.smtp, options.from);
  return {
    async send(email) {
      try {
        await smtp.send(email);
      } catch (err) {
        if (options.production) throw err;
        options.log.warn({ err, outboxDir: options.outboxDir }, "SMTP unreachable: email written to the outbox folder");
        await outbox.send(email);
      }
    },
  };
}
