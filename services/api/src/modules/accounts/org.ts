/**
 * Companies, teams and members, as the API reads them (ADR 0016). They live
 * in the commerce platform, behind the connector's `organizations`; this
 * wraps them with a minute's cache and the product's own rules (who may
 * approve, what a missing threshold means).
 *
 * Without a connector that has organizations, development reads the
 * fictional demo company from `infra/seed` (`seedOrg`); production refuses
 * the dashboard instead.
 */
import type { OrganizationsConnector } from "@gifting/commerce";
import { can, type MemberRole, type Membership, rolesOnTeam } from "@gifting/domain";
import { demoCompany } from "@gifting/seed";

export type { MemberRole };

export type OrgTeam = {
  key: string;
  name: string;
  companyKey: string;
  /** None set counts as 0: every send needs approval (fails closed). */
  approvalThresholdCents: number;
};

export type OrgMember = { id: string; name: string; companyKey: string; memberships: Membership[] };

export interface OrgDirectory {
  /** Every role the person holds, in every company. */
  membershipsOf(customerId: string): Promise<Membership[]>;
  company(key: string): Promise<{ key: string; name: string } | null>;
  teams(companyKey: string): Promise<OrgTeam[]>;
  team(companyKey: string, teamKey: string): Promise<OrgTeam | null>;
  members(companyKey: string): Promise<OrgMember[]>;
  member(companyKey: string, id: string): Promise<OrgMember | null>;
  /** The people who may approve on the team: roles that grant `campaign:approve` there. */
  approvers(companyKey: string, teamKey: string): Promise<OrgMember[]>;
}

type Cache = { ttlMs: number; now: () => number };

/** Remembers each answer for `ttlMs`, so a dashboard page doesn't ask the platform on every call. A failure is not remembered. */
function memo<A extends string[], T>(fn: (...args: A) => Promise<T>, cache: Cache): (...args: A) => Promise<T> {
  if (cache.ttlMs <= 0) return fn;
  const entries = new Map<string, { at: number; value: Promise<T> }>();
  return (...args: A) => {
    const key = JSON.stringify(args);
    const hit = entries.get(key);
    if (hit && cache.now() - hit.at < cache.ttlMs) return hit.value;
    const value = fn(...args).catch((err: unknown) => {
      entries.delete(key);
      throw err;
    });
    if (entries.size > 5_000) entries.clear();
    entries.set(key, { at: cache.now(), value });
    return value;
  };
}

/** The API's directory over a connector's organizations. Role changes apply within `ttlMs` (a minute by default). */
export function orgDirectory(orgs: OrganizationsConnector, options: Partial<Cache> = {}): OrgDirectory {
  const cache: Cache = { ttlMs: options.ttlMs ?? 60_000, now: options.now ?? Date.now };
  const membershipsOf = memo((id: string) => orgs.membershipsOf(id), cache);
  const company = memo((key: string) => orgs.company(key), cache);
  const teams = memo(async (companyKey: string): Promise<OrgTeam[]> => {
    const list = await orgs.teams(companyKey);
    return list.map((t) => ({ key: t.key, name: t.name, companyKey, approvalThresholdCents: t.approvalThresholdCents ?? 0 }));
  }, cache);
  const members = memo(async (companyKey: string): Promise<OrgMember[]> => {
    const list = await orgs.members(companyKey);
    return list.map((m) => ({ id: m.id, name: m.name, companyKey, memberships: m.memberships.filter((x) => x.companyKey === companyKey) }));
  }, cache);

  return {
    membershipsOf,
    company,
    teams,
    team: async (companyKey, teamKey) => (await teams(companyKey)).find((t) => t.key === teamKey) ?? null,
    members,
    member: async (companyKey, id) => (await members(companyKey)).find((m) => m.id === id) ?? null,
    approvers: async (companyKey, teamKey) =>
      (await members(companyKey)).filter((m) => can(rolesOnTeam(m.memberships, companyKey, teamKey), "campaign:approve")),
  };
}

/** The company the dashboard falls back to in development: the demo company, in whichever directory is in use. */
export const DEV_COMPANY_KEY = demoCompany.key;

const demoMembers = demoCompany.members.map((m) => ({
  id: m.id,
  name: m.name,
  memberships: m.memberships.map((x): Membership => ({ ...x, companyKey: demoCompany.key })),
}));

/** The fictional demo company from `infra/seed`, for development and tests without a platform. */
export const seedOrganizations: OrganizationsConnector = {
  membershipsOf: async (id) => (demoMembers.find((m) => m.id === id)?.memberships ?? []).map((x) => ({ ...x })),
  company: async (key) => (key === demoCompany.key ? { key, name: demoCompany.name } : null),
  teams: async (key) => (key === demoCompany.key ? demoCompany.teams.map((t) => ({ ...t })) : []),
  members: async (key) => (key === demoCompany.key ? demoMembers.map((m) => ({ ...m, memberships: m.memberships.map((x) => ({ ...x })) })) : []),
};

export const seedOrg: OrgDirectory = orgDirectory(seedOrganizations, { ttlMs: 0 });
