/**
 * The demo companies and teams as commercetools Business Units (spike 4): a
 * Company unit per company and a Division per team, with the demo customers
 * as their associates. In each company the first customer is the owner and
 * the second an admin (both inherited by the teams). The rest are split
 * across the teams, where the first of each team approves and the others
 * send. Pure, so the role split is tested here.
 */
import type { AssociateDraft, BusinessUnitImport } from "@commercetools/importapi-sdk";

import type { DemoCustomer } from "./customers";
import { demoCompanies } from "./index";

/** Campaigns above this need an approver (ADR: approvals, M3). */
export const DEMO_APPROVAL_THRESHOLD_CENTS = 50_000;

/** How long recipient data is kept after a gift settles. */
export const DEMO_RETENTION_DAYS = 365;

type Role = "owner" | "admin" | "approver" | "sender";

function associate(customerKey: string, role: Role, inherited: boolean): AssociateDraft {
  return {
    customer: { typeId: "customer", key: customerKey },
    associateRoleAssignments: [{ associateRole: { typeId: "associate-role", key: role }, inheritance: inherited ? "Enabled" : "Disabled" }],
  };
}

export type TeamMembers = { teamKey: string; approverKey?: string; senderKeys: string[] };

/** Who is what in each company: owner, admin, and per team an approver and senders. */
export function companyRoles(customers: readonly DemoCustomer[]) {
  return demoCompanies.map((company) => {
    const people = customers.filter((c) => c.companyKey === company.key).map((c) => c.key);
    const [ownerKey, adminKey, ...rest] = people;
    const teams: TeamMembers[] = company.teams.map((team) => ({ teamKey: team.key, senderKeys: [] }));
    rest.forEach((key, i) => {
      const team = teams[i % teams.length]!;
      if (team.approverKey === undefined) team.approverKey = key;
      else team.senderKeys.push(key);
    });
    return { company, ownerKey, adminKey, teams };
  });
}

export function businessUnitImports(customers: readonly DemoCustomer[]): BusinessUnitImport[] {
  return companyRoles(customers).flatMap(({ company, ownerKey, adminKey, teams }) => {
    const companyUnit: BusinessUnitImport = {
      unitType: "Company",
      key: company.key,
      name: company.name,
      contactEmail: `gifting@${company.domain}`,
      stores: [{ typeId: "store", key: "gifting" }],
      storeMode: "Explicit",
      associates: [...(ownerKey ? [associate(ownerKey, "owner", true)] : []), ...(adminKey ? [associate(adminKey, "admin", true)] : [])],
      custom: {
        type: { typeId: "type", key: "company-settings" },
        fields: {
          brandColor: { type: "String", value: company.brandColor },
          retentionDays: { type: "Number", value: DEMO_RETENTION_DAYS },
          allowOverage: { type: "Boolean", value: false },
          emailDomains: { type: "StringSet", value: [company.domain] },
        },
      },
    };
    const teamUnits = company.teams.map((team): BusinessUnitImport => {
      const members = teams.find((t) => t.teamKey === team.key)!;
      return {
        unitType: "Division",
        key: team.key,
        name: `${company.name} · ${team.name}`,
        parentUnit: { typeId: "business-unit", key: company.key },
        // Teams inherit the company's stores by default. Setting storeMode here
        // makes a re-import try to edit the team's stores, which commercetools refuses.
        associateMode: "ExplicitAndFromParent",
        approvalRuleMode: "ExplicitAndFromParent",
        associates: [
          ...(members.approverKey ? [associate(members.approverKey, "approver", false)] : []),
          ...members.senderKeys.map((key) => associate(key, "sender", false)),
        ],
        custom: {
          type: { typeId: "type", key: "team-settings" },
          fields: {
            approvalThresholdCents: { type: "Number", value: DEMO_APPROVAL_THRESHOLD_CENTS },
            approverIds: { type: "StringSet", value: members.approverKey ? [members.approverKey] : [] },
          },
        },
      };
    });
    return [companyUnit, ...teamUnits];
  });
}
