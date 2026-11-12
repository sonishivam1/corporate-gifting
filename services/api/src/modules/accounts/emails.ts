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

const ROLE_NAMES = { owner: "an owner", admin: "an admin", approver: "an approver", sender: "a sender" } as const;

/** An invitation to a company (ADR 0017). Names the company, the role and the team; the link is the only way in. */
export function invitationEmail(
  to: string,
  invite: { inviterName: string; companyName: string; role: keyof typeof ROLE_NAMES; teamName: string | null; link: string; days: number },
): Email {
  const where = invite.teamName ? `${invite.companyName} (${invite.teamName})` : invite.companyName;
  return brandedEmail({
    to,
    subject: `${invite.inviterName} invited you to ${invite.companyName} on Gifting`,
    preheader: `Join ${where} as ${ROLE_NAMES[invite.role]}.`,
    heading: `Join ${invite.companyName} on Gifting`,
    greeting: "Hi there,",
    paragraphs: [`${invite.inviterName} invited you to join ${where} as ${ROLE_NAMES[invite.role]}. Accept to start sending and approving gifts with your team.`],
    button: { label: "Accept the invitation", href: invite.link },
    afterButton: `This invitation expires in ${invite.days} days. Sign in, or create an account, with this email address to accept it.`,
    note: "You're receiving this because someone at this company invited this address. If you weren't expecting it, you can ignore this email: nothing happens unless you accept.",
  });
}
