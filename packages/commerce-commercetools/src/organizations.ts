/**
 * The contract's organizations on commercetools (ADR 0016): a Company
 * Business Unit per company, a Division per team, and associates with the
 * associate roles `owner`, `admin`, `approver` and `sender`.
 *
 * Only explicit associates are read. Owners and admins are associates of the
 * Company unit, approvers and senders of a Division; the product applies
 * company roles to every team itself, so it never waits for commercetools'
 * eventually consistent inheritance. Other roles, and a role held on the
 * wrong kind of unit, are dropped. Keys and ids travel as query variables,
 * never pasted into a predicate.
 */
import type { BusinessUnit, Customer as CtCustomer } from "@commercetools/platform-sdk";
import type { OrganizationsConnector, OrgMember, OrgTeam } from "@gifting/commerce";
import type { CtApi } from "@gifting/ct";
import { isCompanyRole, MEMBER_ROLES, type MemberRole, type Membership } from "@gifting/domain";

const PAGE = 500;

const isRole = (key: string): key is MemberRole => (MEMBER_ROLES as readonly string[]).includes(key);

/** The memberships one associate's role assignments give on one unit. */
export function unitMemberships(unit: BusinessUnit, customerId: string): Membership[] {
  const company = unit.unitType === "Company";
  const companyKey = company ? unit.key : unit.topLevelUnit.key;
  return unit.associates
    .filter((a) => a.customer.id === customerId)
    .flatMap((a) => a.associateRoleAssignments.map((r) => r.associateRole.key ?? ""))
    .filter(isRole)
    .filter((role) => isCompanyRole(role) === company)
    .map((role): Membership => (company ? { companyKey, role } : { companyKey, teamKey: unit.key, role }));
}

/** A team's name without the company's in front ("Lumen Labs · People" is shown as "People"). */
export function teamName(unitName: string, companyName: string | null): string {
  const prefix = companyName ? `${companyName} · ` : null;
  return prefix && unitName.startsWith(prefix) && unitName.length > prefix.length ? unitName.slice(prefix.length) : unitName;
}

export function toOrgTeam(unit: BusinessUnit, companyName: string | null): OrgTeam {
  const threshold: unknown = unit.custom?.fields?.approvalThresholdCents;
  return {
    key: unit.key,
    name: teamName(unit.name, companyName),
    approvalThresholdCents: typeof threshold === "number" && Number.isInteger(threshold) && threshold >= 0 ? threshold : null,
  };
}

function personName(customer: CtCustomer | undefined, fallback: string): string {
  const name = [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim();
  return name || customer?.email || fallback;
}

/** Everyone with a role on the company's units, with their memberships in that company. Units come Company first. */
export function toOrgMembers(units: readonly BusinessUnit[]): OrgMember[] {
  const byId = new Map<string, OrgMember>();
  for (const unit of units) {
    for (const associate of unit.associates) {
      const id = associate.customer.id;
      const memberships = unitMemberships(unit, id);
      if (memberships.length === 0) continue;
      const member = byId.get(id) ?? { id, name: personName(associate.customer.obj, id), memberships: [] };
      for (const m of memberships) {
        if (!member.memberships.some((x) => x.role === m.role && (x.teamKey ?? null) === (m.teamKey ?? null))) member.memberships.push(m);
      }
      byId.set(id, member);
    }
  }
  return [...byId.values()];
}

/** Company units first, then teams by name: the order the product shows them in. */
function companyFirst(units: BusinessUnit[]): BusinessUnit[] {
  return [...units].sort((a, b) => (a.unitType === b.unitType ? a.name.localeCompare(b.name) : a.unitType === "Company" ? -1 : 1));
}

export function createCtOrganizations(api: CtApi): OrganizationsConnector {
  async function unitsOf(companyKey: string, expandCustomers = false): Promise<BusinessUnit[]> {
    const { body } = await api
      .businessUnits()
      .get({
        queryArgs: {
          where: "topLevelUnit(key = :key)",
          "var.key": companyKey,
          limit: PAGE,
          ...(expandCustomers ? { expand: ["associates[*].customer"] } : {}),
        },
      })
      .execute();
    return companyFirst(body.results);
  }

  return {
    async membershipsOf(customerId) {
      const { body } = await api
        .businessUnits()
        .get({ queryArgs: { where: "associates(customer(id = :id))", "var.id": customerId, limit: PAGE } })
        .execute();
      return companyFirst(body.results).flatMap((unit) => unitMemberships(unit, customerId));
    },
    async company(companyKey) {
      const units = await unitsOf(companyKey);
      const company = units.find((u) => u.unitType === "Company" && u.key === companyKey);
      return company ? { key: company.key, name: company.name } : null;
    },
    async teams(companyKey) {
      const units = await unitsOf(companyKey);
      const company = units.find((u) => u.unitType === "Company" && u.key === companyKey);
      if (!company) return [];
      return units.filter((u) => u.unitType === "Division").map((u) => toOrgTeam(u, company.name));
    },
    async members(companyKey) {
      const units = await unitsOf(companyKey, true);
      if (!units.some((u) => u.unitType === "Company" && u.key === companyKey)) return [];
      return toOrgMembers(units);
    },
  };
}
