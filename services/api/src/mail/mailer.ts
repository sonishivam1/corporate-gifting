/**
 * Every email the API sends goes through one mailer: account emails (ADR 0015,
 * commercetools doesn't send them) and gift emails (the email channel, ADR 0008).
 * It sends over SMTP, to whichever provider the settings name: SendGrid on GCP.
 * Outside production, with no SMTP set or none answering, an email is written to
 * `.data/outbox` (gitignored) instead, so nothing is lost and the flow works
 * without a provider. Emails are never logged: they hold addresses and links.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { type OutgoingMail, type SmtpSettings, smtpTransport } from "@gifting/channels";
import { AppError, type Logger } from "@gifting/logger";

/** An image the HTML shows with `cid:<cid>` (attached inline; email clients block SVG and data: URLs). */
export type InlineImage = { cid: string; filename: string; contentType: string; content: Buffer };

export type Email = Omit<OutgoingMail, "from"> & { images?: InlineImage[] };

export type Mailer = { send(email: Email): Promise<{ messageId: string | null }> };

const addressLine = (to: Email["to"]) => (typeof to === "string" ? to : `${to.name} <${to.address}>`);

/**
 * Writes each email as an .eml file (the text), plus an .html file to open in
 * a browser and see the design, for development and tests.
 */
export function outboxMailer(dir: string, from: string): Mailer {
  return {
    async send(email) {
      await mkdir(dir, { recursive: true });
      // The id keeps emails apart: a campaign sends several with one subject in the same millisecond.
      const id = randomUUID();
      const base = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${id.slice(0, 8)}-${email.subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);
      const message = [`From: ${from}`, `To: ${addressLine(email.to)}`, `Subject: ${email.subject}`, "Content-Type: text/plain; charset=utf-8", "", email.text, ""].join("\r\n");
      await writeFile(`${base}.eml`, message, "utf8");
      // In a browser the inline images can be data: URLs.
      const preview = (email.images ?? []).reduce((html, image) => html.replaceAll(`cid:${image.cid}`, `data:${image.contentType};base64,${image.content.toString("base64")}`), email.html);
      await writeFile(`${base}.html`, preview, "utf8");
      return { messageId: `outbox-${id}` };
    },
  };
}

export function smtpMailer(smtp: SmtpSettings, from: string): Mailer {
  const transport = smtpTransport(smtp);
  return {
    async send({ images, ...email }) {
      const info = await transport.sendMail({
        from,
        ...email,
        attachments: (images ?? []).map((i) => ({ cid: i.cid, filename: i.filename, contentType: i.contentType, content: i.content, contentDisposition: "inline" as const })),
      });
      return { messageId: info.messageId ?? null };
    },
  };
}

/** SMTP, falling back to the outbox when SMTP can't be reached (never in production). */
export function createMailer(options: { smtp?: SmtpSettings; from: string; outboxDir: string; production: boolean; log: Logger }): Mailer {
  const outbox = outboxMailer(options.outboxDir, options.from);
  if (!options.smtp) {
    if (options.production) throw new AppError("config_invalid", "No SMTP server is set (SMTP_HOST or SMTP_URL).");
    options.log.warn({ outboxDir: options.outboxDir }, "No SMTP server is set: emails go to the outbox folder");
    return outbox;
  }
  const smtp = smtpMailer(options.smtp, options.from);
  return {
    async send(email) {
      try {
        return await smtp.send(email);
      } catch (err) {
        if (options.production) throw err;
        options.log.warn({ err, outboxDir: options.outboxDir }, "SMTP unreachable: email written to the outbox folder");
        return await outbox.send(email);
      }
    },
  };
}
