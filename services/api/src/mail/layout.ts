/**
 * The branded layout every email uses: the Gifting wordmark, one white card
 * with a heading, paragraphs and a button, a fallback link, a note, and a
 * footer. Built for email clients, not browsers:
 * - tables for layout and inline styles only (Gmail drops <style> in some
 *   views, Outlook ignores most CSS);
 * - the logo is an inline attachment (cid:), never SVG or a data: URL;
 * - a hidden preheader sets the preview line in the inbox;
 * - light only (color-scheme), so clients don't invert the brand colours;
 * - the button is a padded link, so it works where images are blocked.
 *
 * Every piece of text is escaped here; callers pass plain strings.
 */
import type { Email, InlineImage } from "./mailer";
import { LOGO_PNG_BASE64 } from "./logo";

/** The prototype's palette (packages/ui globals.css): navy ink, one blue, soft surfaces. */
const C = {
  page: "#f5f8fc",
  card: "#ffffff",
  ink: "#012754",
  muted: "#59728f",
  border: "#e2e9f2",
  primary: "#2570c5",
  onPrimary: "#ffffff",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const LOGO_CID = "gifting-logo";
const logo: InlineImage = { cid: LOGO_CID, filename: "gifting.png", contentType: "image/png", content: Buffer.from(LOGO_PNG_BASE64, "base64") };

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export type BrandedEmail = {
  to: string;
  subject: string;
  /** The inbox preview line (hidden in the email itself). */
  preheader: string;
  heading: string;
  /** The opening line, for example "Hi Ada,". */
  greeting?: string;
  paragraphs: string[];
  button: { label: string; href: string };
  /** Under the button, for example how long the link works. */
  afterButton?: string;
  /** Why the person got this email, in small print above the footer. */
  note: string;
};

export function brandedEmail(e: BrandedEmail): Email {
  const p = (text: string, style = "") => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${C.ink};${style}">${escapeHtml(text)}</p>`;
  const href = escapeHtml(e.button.href);
  const year = new Date().getUTCFullYear();

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(e.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${escapeHtml(e.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
    <tr><td style="padding:0 4px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:10px;"><img src="cid:${LOGO_CID}" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px;"></td>
        <td style="font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:-0.2px;color:${C.ink};">Gifting</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:36px 32px;font-family:${FONT};">
      <h1 style="margin:0 0 20px;font-size:24px;line-height:32px;font-weight:700;color:${C.ink};">${escapeHtml(e.heading)}</h1>
      ${e.greeting ? p(e.greeting) : ""}
      ${e.paragraphs.map((t) => p(t)).join("\n      ")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>
        <td style="border-radius:8px;background:${C.primary};">
          <a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;color:${C.onPrimary};text-decoration:none;border-radius:8px;">${escapeHtml(e.button.label)}</a>
        </td>
      </tr></table>
      ${e.afterButton ? p(e.afterButton, `font-size:14px;line-height:22px;color:${C.muted};`) : ""}
      <p style="margin:0;font-size:14px;line-height:22px;color:${C.muted};">If the button doesn't work, copy this link into your browser:</p>
      <p style="margin:4px 0 0;font-size:13px;line-height:20px;word-break:break-all;"><a href="${href}" target="_blank" style="color:${C.primary};text-decoration:underline;">${href}</a></p>
      <hr style="border:0;border-top:1px solid ${C.border};margin:28px 0 20px;">
      <p style="margin:0;font-size:13px;line-height:20px;color:${C.muted};">${escapeHtml(e.note)}</p>
    </td></tr>
    <tr><td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};text-align:center;">
      Gifting &middot; Corporate gifting, simplified<br>&copy; ${year} Gifting. This is an automated message; replies aren't read.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    e.heading,
    "",
    ...(e.greeting ? [e.greeting, ""] : []),
    ...e.paragraphs.flatMap((t) => [t, ""]),
    `${e.button.label}: ${e.button.href}`,
    "",
    ...(e.afterButton ? [e.afterButton, ""] : []),
    e.note,
    "",
    "Gifting · Corporate gifting, simplified",
  ].join("\n");

  return { to: e.to, subject: e.subject, text, html, images: [logo] };
}
