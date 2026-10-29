/**
 * Companies, teams and members. They live in commercetools as Business Units,
 * the `team-settings` custom type and Associates (ADR 0001); M1 reads them
 * from there. Until then the API reads the fictional demo company.
 */
import { demoCompany } from "@gifting/seed";

export type MemberRole = "owner" | "admin" | "sender" | "approver";

export type OrgTeam = {
  key: string;
  name: string;
  companyKey: string;
  approvalThresholdCents: number;
  approverIds: readonly string[];
};

export type OrgMember = {
  id: string;
  name: string;
  companyKey: string;
  teams: readonly { teamKey: string; role: MemberRole }[];
};

export interface OrgDirectory {
  company(key: string): Promise<{ key: string; name: string } | null>;
  team(companyKey: string, teamKey: string): Promise<OrgTeam | null>;
  member(id: string): Promise<OrgMember | null>;
  members(companyKey: string): Promise<OrgMember[]>;
}

const teams: OrgTeam[] = demoCompany.teams.map((t) => ({ ...t, companyKey: demoCompany.key }));
const members: OrgMember[] = demoCompany.members.map((m) => ({ ...m, companyKey: demoCompany.key }));

export const seedOrg: OrgDirectory = {
  company: async (key) => (key === demoCompany.key ? { key, name: demoCompany.name } : null),
  team: async (companyKey, teamKey) => teams.find((t) => t.companyKey === companyKey && t.key === teamKey) ?? null,
  member: async (id) => members.find((m) => m.id === id) ?? null,
  members: async (companyKey) => members.filter((m) => m.companyKey === companyKey),
};
