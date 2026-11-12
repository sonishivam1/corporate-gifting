/**
 * The contract's organization writes on commercetools (ADR 0017): roles are
 * associate roles on the Company unit (owner, admin) or on a team's Division
 * (approver, sender), as `pnpm member:add` writes them; teams are Divisions
 * under the company.
 *
 * Every write reads the unit, then posts with its version, and tries again
 * (up to 3 times) when someone changed the unit in between. Giving a role
 * already held, or taking away one not held, sends nothing. Roles the
 * product doesn't know are kept as they are. Inactive units, and teams of an
 * Inactive company, are refused like unknown ones.
 */
import type { AssociateDraft, AssociateRoleAssignmentDraft, BusinessUnit, BusinessUnitUpdateAction } from "@commercetools/platform-sdk";
import type { MemberWrites, OrgTeam, TeamWrites } from "@gifting/commerce";
import type { CtApi } from "@gifting/ct";
import { isCompanyRole, type Membership } from "@gifting/domain";

import { toOrgTeam } from "./organizations";

const ATTEMPTS = 3;

const statusOf = (err: unknown) => (err as { statusCode?: number })?.statusCode ?? 0;
const codesOf = (err: unknown): string[] =>
  ((err as { body?: { errors?: { code?: string }[] } })?.body?.errors ?? []).map((e) => e.code ?? "");

/** True when commercetools refused a write because the unit's version moved on. */
export const isVersionConflict = (err: unknown): boolean => statusOf(err) === 409 && codesOf(err).includes("ConcurrentModification");
const isDuplicate = (err: unknown): boolean => codesOf(err).includes("DuplicateField");

/** The name a team's Division carries: the company's name in front, as the seed writes it ("Lumen Labs · People"). */
export const divisionName = (companyName: string, teamName: string): string => `${companyName} · ${teamName}`;

/** Company roles reach the company's Divisions in commercetools too, as `member:add` writes them; the product reads only explicit ones. */
const assignment = (role: string): AssociateRoleAssignmentDraft => ({
  associateRole: { typeId: "associate-role", key: role },
  inheritance: isCompanyRole(role as Membership["role"]) ? "Enabled" : "Disabled",
});

const assignmentsOf = (associate: BusinessUnit["associates"][number]): AssociateRoleAssignmentDraft[] =>
  associate.associateRoleAssignments.map((a) => ({ associateRole: { typeId: "associate-role", key: a.associateRole.key! }, inheritance: a.inheritance }));

/** The update action that gives `role` to the customer on this unit, or null when they hold it already. */
export function addRoleAction(unit: BusinessUnit, customerId: string, role: string): BusinessUnitUpdateAction | null {
  const associate = unit.associates.find((a) => a.customer.id === customerId);
  const customer = { typeId: "customer" as const, id: customerId };
  if (!associate) return { action: "addAssociate", associate: { customer, associateRoleAssignments: [assignment(role)] } satisfies AssociateDraft };
  if (associate.associateRoleAssignments.some((a) => a.associateRole.key === role)) return null;
  return { action: "changeAssociate", associate: { customer, associateRoleAssignments: [...assignmentsOf(associate), assignment(role)] } };
}

/** The update action that takes `role` away from the customer on this unit, or null when they don't hold it. */
export function removeRoleAction(unit: BusinessUnit, customerId: string, role: string): BusinessUnitUpdateAction | null {
  const associate = unit.associates.find((a) => a.customer.id === customerId);
  if (!associate?.associateRoleAssignments.some((a) => a.associateRole.key === role)) return null;
  const rest = assignmentsOf(associate).filter((a) => a.associateRole.key !== role);
  const customer = { typeId: "customer" as const, id: customerId };
  return rest.length === 0 ? { action: "removeAssociate", customer } : { action: "changeAssociate", associate: { customer, associateRoleAssignments: rest } };
}

export function createCtOrganizationWrites(api: CtApi): { memberWrites: MemberWrites; teamWrites: TeamWrites } {
  async function unit(key: string): Promise<BusinessUnit | null> {
    try {
      return (await api.businessUnits().withKey({ key }).get().execute()).body;
    } catch (err) {
      if (statusOf(err) === 404) return null;
      throw err;
    }
  }

  /** The company's Company unit, when it exists and is Active. */
  async function activeCompany(companyKey: string): Promise<BusinessUnit | null> {
    const company = await unit(companyKey);
    return company?.unitType === "Company" && company.status !== "Inactive" ? company : null;
  }

  /** The unit a membership lives on: the Company for company roles, the team's Division for team roles. Null when it isn't there. */
  async function unitOf(m: Membership): Promise<BusinessUnit | null> {
    if (isCompanyRole(m.role) === Boolean(m.teamKey)) return null;
    const company = await activeCompany(m.companyKey);
    if (!company) return null;
    if (!m.teamKey) return company;
    const team = await unit(m.teamKey);
    return team?.unitType === "Division" && team.topLevelUnit.key === m.companyKey && team.status !== "Inactive" ? team : null;
  }

  /** Reads the unit and applies the action it calls for, again from a fresh read when the version moved on. */
  async function update(read: () => Promise<BusinessUnit | null>, actionFor: (unit: BusinessUnit) => BusinessUnitUpdateAction | null): Promise<BusinessUnit | null> {
    for (let attempt = 1; ; attempt++) {
      const current = await read();
      if (!current) return null;
      const action = actionFor(current);
      if (!action) return current;
      try {
        return (await api.businessUnits().withKey({ key: current.key }).post({ body: { version: current.version, actions: [action] } }).execute()).body;
      } catch (err) {
        if (!isVersionConflict(err) || attempt >= ATTEMPTS) throw err;
      }
    }
  }

  return {
    memberWrites: {
      async addRole(customerId, m) {
        return (await update(() => unitOf(m), (u) => addRoleAction(u, customerId, m.role))) !== null;
      },
      async removeRole(customerId, m) {
        return (await update(() => unitOf(m), (u) => removeRoleAction(u, customerId, m.role))) !== null;
      },
    },
    teamWrites: {
      async createTeam(companyKey, { key, name }): Promise<OrgTeam | { conflict: true } | null> {
        const company = await activeCompany(companyKey);
        if (!company) return null;
        if (await unit(key)) return { conflict: true };
        try {
          const created = await api
            .businessUnits()
            .post({
              body: {
                unitType: "Division",
                key,
                name: divisionName(company.name, name),
                parentUnit: { typeId: "business-unit", key: companyKey },
                // As the seed writes teams: stores come from the company; the product reads only explicit associates.
                associateMode: "ExplicitAndFromParent",
                approvalRuleMode: "ExplicitAndFromParent",
              },
            })
            .execute();
          return toOrgTeam(created.body, company.name);
        } catch (err) {
          if (isDuplicate(err)) return { conflict: true };
          throw err;
        }
      },
      async renameTeam(companyKey, teamKey, name) {
        const company = await activeCompany(companyKey);
        if (!company) return null;
        const updated = await update(
          async () => {
            const team = await unit(teamKey);
            return team?.unitType === "Division" && team.topLevelUnit.key === companyKey ? team : null;
          },
          (team) => (team.name === divisionName(company.name, name) ? null : { action: "changeName", name: divisionName(company.name, name) }),
        );
        return updated ? toOrgTeam(updated, company.name) : null;
      },
    },
  };
}
