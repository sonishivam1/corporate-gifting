/** The account emails (ADR 0015): short, in the product's voice, in the branded layout (mail/layout.ts). */
import { brandedEmail } from "../../mail/layout";
import type { Email } from "../../mail/mailer";

export function verificationEmail(to: string, firstName: string | null, link: string, ttlMinutes: number): Email {
  return brandedEmail({
    to,
    subject: "Verify your email for Gifting",
    preheader: "One click to confirm your email and finish setting up your Gifting account.",
    heading: "Confirm your email address",
    greeting: `Hi${firstName ? ` ${firstName}` : " there"},`,
    paragraphs: ["Thanks for signing up for Gifting. Confirm this is your email address to finish creating your account and start sending gifts."],
    button: { label: "Verify my email", href: link },
    afterButton: `This link expires in ${ttlMinutes} minutes. If it has expired, you can ask for a new one when you sign in.`,
    note: "You're receiving this because this address was used to create a Gifting account. If that wasn't you, you can ignore this email: nobody can sign in with this address until it's confirmed.",
  });
}
