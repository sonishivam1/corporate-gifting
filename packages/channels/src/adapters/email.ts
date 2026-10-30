import { type ContentProvider, createStaticContent } from "@gifting/content";
import nodemailer, { type Transporter } from "nodemailer";

import type { Channel, GiftMessage, SendResult } from "../types";

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Every piece of text that reaches the HTML part goes through this: names and messages are user input. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c]!);
}

/** "2026-12-01" as "Dec 1, 2026", in UTC so the date never shifts. */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Only http(s) links may be placed in an email; anything else (javascript:, data:) is refused. */
function safeLink(link: string): string {
  const url = new URL(link);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("The gift link must be an http(s) URL.");
  return url.toString();
}

export type ComposedEmail = { subject: string; text: string; html: string };

/**
 * Builds the gift email: a plain-text part and an HTML part from the same words.
 * The words come from the content layer; the layout is here. No tracking pixels,
 * no remote images, one button, and the link in plain text for clients that block buttons.
 */
export async function composeGiftEmail(content: ContentProvider, message: GiftMessage, reminder: boolean): Promise<ComposedEmail> {
  const link = safeLink(message.link);
  const senderName = message.senderName;
  const recipientName = message.recipientName ?? "there";
  const family = reminder ? "email.reminder" : "email.gift";
  const [subject, greeting, intro, cta, linkHint, footer] = await Promise.all([
    content.getContent(`${family}.subject` as "email.gift.subject", { senderName }),
    content.getContent("email.gift.greeting", { recipientName }),
    content.getContent(`${family}.intro` as "email.gift.intro", { senderName }),
    content.getContent("email.gift.cta"),
    content.getContent("email.gift.linkHint"),
    content.getContent("email.gift.footer", { senderName }),
  ]);
  const expires = message.expiresOn ? await content.getContent("email.gift.expires", { closesOn: formatIsoDate(message.expiresOn) }) : "";

  const text = [greeting, intro, message.greeting, message.message ?? "", `${cta}: ${link}`, expires, footer].filter(Boolean).join("\n\n");

  const e = escapeHtml;
  const accent = message.branding.brandColor && /^#[0-9a-fA-F]{6}$/.test(message.branding.brandColor) ? message.branding.brandColor : "#0f766e";
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f3faf7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2433;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;">
    <tr><td style="padding:32px 28px;">
      <p style="margin:0 0 16px;font-size:15px;">${e(greeting)}</p>
      <p style="margin:0 0 16px;font-size:20px;font-weight:600;line-height:1.3;">${e(intro)}</p>
      ${message.greeting ? `<p style="margin:0 0 8px;font-size:16px;font-weight:600;">${e(message.greeting)}</p>` : ""}
      ${message.message ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#4a5365;white-space:pre-line;">${e(message.message)}</p>` : ""}
      <p style="margin:0 0 24px;"><a href="${e(link)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 24px;border-radius:10px;">${e(cta)}</a></p>
      ${expires ? `<p style="margin:0 0 8px;font-size:13px;color:#4a5365;">${e(expires)}</p>` : ""}
      <p style="margin:0;font-size:12px;color:#6b7385;word-break:break-all;">${e(linkHint)}<br>${e(link)}</p>
    </td></tr>
  </table>
  <p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#6b7385;">${e(footer)}</p>
</body>
</html>`;

  return { subject, text, html };
}

/** One finished message, as the email channel hands it over. */
export type OutgoingMail = {
  from?: string;
  replyTo?: string;
  to: string | { name: string; address: string };
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

/** What the email channel sends through: a nodemailer transport, or anything shaped like one. */
export type MailTransport = { sendMail(mail: OutgoingMail): Promise<{ messageId?: string | null }> };

export type EmailChannelOptions = {
  transport: MailTransport;
  /** The From header, for example `Digital Gifting <gifts@example.com>`. Must be an address you may send as (SPF and DKIM). Unset: the transport's own. */
  from?: string;
  replyTo?: string;
  content?: ContentProvider;
};

/** An SMTP server, as a URL (`smtp://user:pass@host:587`) or as separate settings. */
export type SmtpSettings = string | { host: string; port: number; user?: string; pass?: string };

const SMTP_TIMEOUTS = { connectionTimeout: 5_000, greetingTimeout: 5_000, socketTimeout: 15_000 };

/** The one SMTP transport every email goes through, whichever provider the settings name. */
export function smtpTransport(smtp: SmtpSettings): Transporter {
  if (typeof smtp === "string") return nodemailer.createTransport({ url: smtp, ...SMTP_TIMEOUTS });
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    // 465 is TLS from the start; 587 upgrades to TLS (STARTTLS).
    secure: smtp.port === 465,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass ?? "" } } : {}),
    ...SMTP_TIMEOUTS,
  });
}

/**
 * The email channel (ADR 0008). It sends the plain-text and HTML parts of one
 * message and returns the server's message id. The transport decides where the
 * message goes, so a provider is a setting here, never a code change.
 */
export function emailChannel({ transport, from, replyTo, content = createStaticContent() }: EmailChannelOptions): Channel {
  async function deliver(message: GiftMessage, reminder: boolean): Promise<SendResult> {
    const composed = await composeGiftEmail(content, message, reminder);
    const info = await transport.sendMail({
      ...(from ? { from } : {}),
      ...(replyTo ? { replyTo } : {}),
      to: message.recipientName ? { name: message.recipientName, address: message.to } : message.to,
      subject: composed.subject,
      text: composed.text,
      html: composed.html,
      // Transactional mail: say so, and keep the gift id out of the visible message.
      headers: { "Auto-Submitted": "auto-generated", "X-Tag-gift": message.giftId },
    });
    return { providerMessageId: info.messageId ?? null, status: "sent" };
  }
  return { kind: "email", send: (message) => deliver(message, false), remind: (message) => deliver(message, true) };
}
