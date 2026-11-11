/**
 * What each role may do (ADR 0016, plan: organizations-and-roles.md).
 *
 * Who belongs to which company and team comes from the commerce platform;
 * what a role allows is ours, the same on every platform. Every dashboard
 * route declares one action, and the API checks it before the handler runs.
 * The apps read the same map to hide what a person can't use. Pure, so the
 * apps can import it.
 */
import { MEMBER_ROLES, type MemberRole } from "./members";

export const ACTIONS = [
  "reports:view",
  "budget:view",
  "catalog:view",
  "campaign:view",
  "campaign:create",
  "campaign:approve",
  "gift:manage",
  "collection:manage",
  "recipients:view",
  "recipients:add",
  "recipients:manage",
  "budget:topup",
  "statement:view",
  "members:manage",
  "integrations:manage",
] as const;
export type Action = (typeof ACTIONS)[number];

const EVERYONE: readonly MemberRole[] = MEMBER_ROLES;
const SENDERS: readonly MemberRole[] = ["owner", "admin", "sender"];
const MANAGERS: readonly MemberRole[] = ["owner", "admin"];

/** The roles that grant each action. Approvers see and decide; senders send; owners and admins also run the company. */
export const ROLE_ACTIONS: Readonly<Record<Action, readonly MemberRole[]>> = {
  "reports:view": EVERYONE,
  "budget:view": EVERYONE,
  "catalog:view": EVERYONE,
  "campaign:view": EVERYONE,
  "campaign:create": SENDERS,
  "campaign:approve": ["owner", "approver"],
  "gift:manage": SENDERS,
  "collection:manage": SENDERS,
  "recipients:view": SENDERS,
  "recipients:add": SENDERS,
  "recipients:manage": MANAGERS,
  "budget:topup": MANAGERS,
  "statement:view": MANAGERS,
  "members:manage": MANAGERS,
  "integrations:manage": MANAGERS,
};

/** Roles held on the company apply to every team; the others are held on one team. */
export const COMPANY_ROLES: readonly MemberRole[] = ["owner", "admin"];

export function isCompanyRole(role: MemberRole): boolean {
  return COMPANY_ROLES.includes(role);
}

/**
 * One role a person holds: on the company (no `teamKey`) or on one team.
 * A company role given with a team, or a team role without one, grants
 * nothing: connectors map the platform's roles to these shapes.
 */
export type Membership = { companyKey: string; teamKey?: string | null; role: MemberRole };

/** The roles that apply to a person on one team of one company, highest first. */
export function rolesOnTeam(memberships: readonly Membership[], companyKey: string, teamKey: string): MemberRole[] {
  const held = new Set<MemberRole>();
  for (const m of memberships) {
    if (m.companyKey !== companyKey || !MEMBER_ROLES.includes(m.role)) continue;
    if (isCompanyRole(m.role) ? !m.teamKey : m.teamKey === teamKey) held.add(m.role);
  }
  return MEMBER_ROLES.filter((r) => held.has(r));
}

/** True when any of the roles grants the action. Unknown roles grant nothing. */
export function can(roles: readonly string[], action: Action): boolean {
  const granted = ROLE_ACTIONS[action] as readonly string[];
  return roles.some((r) => granted.includes(r));
}

/** Every action the roles grant, in the order of `ACTIONS`. */
export function actionsFor(roles: readonly string[]): Action[] {
  return ACTIONS.filter((a) => can(roles, a));
}

/** The companies a person belongs to, in the order their memberships list them. */
export function companiesOf(memberships: readonly Membership[]): string[] {
  return [...new Set(memberships.filter((m) => MEMBER_ROLES.includes(m.role)).map((m) => m.companyKey))];
}

/**
 * The teams a person may work in: every team of the company when they hold
 * a company role, else the teams their team roles are on. `teamKeys` is the
 * company's teams, in display order.
 */
export function reachableTeams(memberships: readonly Membership[], companyKey: string, teamKeys: readonly string[]): string[] {
  return teamKeys.filter((t) => rolesOnTeam(memberships, companyKey, t).length > 0);
}
