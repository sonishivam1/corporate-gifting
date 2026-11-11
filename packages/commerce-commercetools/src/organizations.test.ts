import type { BusinessUnit } from "@commercetools/platform-sdk";
import { describe, expect, it } from "vitest";

import { teamName, toOrgMembers, toOrgTeam, unitMemberships } from "./organizations";

// Fictional units: just the fields the mapping reads.
const associate = (id: string, roles: string[], customer?: { firstName?: string; lastName?: string; email: string }) => ({
  customer: { typeId: "customer", id, ...(customer ? { obj: customer } : {}) },
  associateRoleAssignments: roles.map((key) => ({ associateRole: { typeId: "associate-role", key }, inheritance: "Disabled" })),
});

const company = {
  unitType: "Company",
  key: "company-a",
  name: "Company A",
  topLevelUnit: { typeId: "business-unit", key: "company-a" },
  associates: [associate("c-1", ["owner"], { firstName: "Ada", lastName: "Park", email: "ada@a.example" }), associate("c-2", ["admin", "sender"], { email: "ben@a.example" })],
} as unknown as BusinessUnit;

const team = {
  unitType: "Division",
  key: "team-a1",
  name: "Company A · People",
  topLevelUnit: { typeId: "business-unit", key: "company-a" },
  custom: { type: { typeId: "type", id: "t" }, fields: { approvalThresholdCents: 50_000 } },
  associates: [associate("c-3", ["approver", "buyer"], { firstName: "Cy", email: "cy@a.example" }), associate("c-2", ["sender", "owner"])],
} as unknown as BusinessUnit;

describe("commercetools organizations mapping", () => {
  it("maps company roles on the Company unit and team roles on a Division", () => {
    expect(unitMemberships(company, "c-1")).toEqual([{ companyKey: "company-a", role: "owner" }]);
    expect(unitMemberships(team, "c-3")).toEqual([{ companyKey: "company-a", teamKey: "team-a1", role: "approver" }]);
  });

  it("drops unknown roles and roles held on the wrong kind of unit", () => {
    // A sender on the company and an owner on a team grant nothing; "buyer" isn't ours.
    expect(unitMemberships(company, "c-2")).toEqual([{ companyKey: "company-a", role: "admin" }]);
    expect(unitMemberships(team, "c-2")).toEqual([{ companyKey: "company-a", teamKey: "team-a1", role: "sender" }]);
    expect(unitMemberships(team, "nobody")).toEqual([]);
  });

  it("reads a team's threshold, and none when it isn't a whole number", () => {
    expect(toOrgTeam(team, "Company A")).toEqual({ key: "team-a1", name: "People", approvalThresholdCents: 50_000 });
    const noThreshold = { ...team, custom: { type: team.custom!.type, fields: { approvalThresholdCents: "lots" } } } as unknown as BusinessUnit;
    expect(toOrgTeam(noThreshold, "Company A").approvalThresholdCents).toBeNull();
  });

  it("shows a team's own name", () => {
    expect(teamName("Company A · People", "Company A")).toBe("People");
    expect(teamName("People", "Company A")).toBe("People");
    expect(teamName("Company A · ", "Company A")).toBe("Company A · ");
  });

  it("collects each person's memberships across the company's units, named from the customer", () => {
    expect(toOrgMembers([company, team])).toEqual([
      { id: "c-1", name: "Ada Park", memberships: [{ companyKey: "company-a", role: "owner" }] },
      { id: "c-2", name: "ben@a.example", memberships: [{ companyKey: "company-a", role: "admin" }, { companyKey: "company-a", teamKey: "team-a1", role: "sender" }] },
      { id: "c-3", name: "Cy", memberships: [{ companyKey: "company-a", teamKey: "team-a1", role: "approver" }] },
    ]);
  });
});
