/** The account emails (ADR 0015): plain, short, and in the product's voice. */
import type { Email } from "../../mail/mailer";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function email(to: string, subject: string, lines: string[], link: { href: string; label: string }): Email {
  const text = [...lines, "", `${link.label}: ${link.href}`, "", "If you didn't ask for this, you can ignore this email.", "", "Gifting"].join("\n");
  const html = [
    ...lines.map((l) => `<p>${escape(l)}</p>`),
    `<p><a href="${escape(link.href)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2570C5;color:#fff;text-decoration:none">${escape(link.label)}</a></p>`,
    `<p style="color:#59728F;font-size:13px">If you didn't ask for this, you can ignore this email.</p>`,
  ].join("\n");
  return { to, subject, text, html };
}

export function verificationEmail(to: string, firstName: string | null, link: string, ttlMinutes: number): Email {
  return email(to, "Verify your email for Gifting", [`Hi${firstName ? ` ${firstName}` : ""},`, `Confirm your email address to finish creating your Gifting account. The link works for ${ttlMinutes} minutes.`], { href: link, label: "Verify my email" });
}
