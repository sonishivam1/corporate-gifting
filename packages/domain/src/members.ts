/**
 * Members and who may join (M1 sign-in plan): the roles a member can hold,
 * their access status, the work-email rule, and the shape the API returns for
 * the signed-in member. Pure, so the apps can import it.
 */
import { z } from "zod";

export const MEMBER_ROLES = ["owner", "admin", "approver", "sender"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_STATUSES = ["invited", "active", "disabled"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * Personal mailbox domains. Members join with a work email only, so these
 * are refused. Not exhaustive: invitations also have to match the company's
 * own email domains (phase B).
 */
export const PERSONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "aol.com",
  "gmail.com",
  "gmx.com",
  "gmx.net",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mac.com",
  "mail.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "yandex.com",
  "zoho.com",
  "zohomail.com",
]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  const normalized = normalizeEmail(email);
  return normalized.slice(normalized.lastIndexOf("@") + 1);
}

export function isPersonalEmail(email: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(emailDomain(email));
}

const role = z.enum(MEMBER_ROLES);

/** What `GET /v1/me` returns: the signed-in member and what they can reach. */
export const memberView = z.object({
  key: z.string(),
  email: z.email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  status: z.enum(MEMBER_STATUSES),
  company: z.object({ key: z.string(), name: z.string() }),
  /** Roles held on the company itself (owner, admin), which apply to every team. */
  companyRoles: z.array(role),
  teams: z.array(z.object({ key: z.string(), name: z.string(), roles: z.array(role) })),
});
export type MemberView = z.infer<typeof memberView>;

/** True when the member holds `wanted` on the company, or on the given team. */
export function hasRole(member: Pick<MemberView, "companyRoles" | "teams">, wanted: MemberRole, teamKey?: string): boolean {
  if (member.companyRoles.includes(wanted)) return true;
  return member.teams.some((t) => (teamKey === undefined || t.key === teamKey) && t.roles.includes(wanted));
}

/** The role to show for a member: their highest, and the team it is on when it is a team role. */
export function primaryRole(member: Pick<MemberView, "companyRoles" | "teams">): { role: MemberRole; team?: string } | null {
  for (const role of MEMBER_ROLES) {
    if (member.companyRoles.includes(role)) return { role };
    const team = member.teams.find((t) => t.roles.includes(role));
    if (team) return { role, team: team.name };
  }
  return null;
}
