import { describe, expect, it } from "vitest";

import { businessUnitImports, companyRoles } from "./business-units";
import { demoCustomers } from "./customers";
import { demoCompanies } from "./index";

describe("demo business units", () => {
  const customers = demoCustomers();
  const units = businessUnitImports(customers);

  it("make a company unit and a division per team, teams under their company", () => {
    expect(units.filter((u) => u.unitType === "Company")).toHaveLength(demoCompanies.length);
    expect(units.filter((u) => u.unitType === "Division")).toHaveLength(demoCompanies.flatMap((c) => c.teams).length);
    for (const unit of units) {
      if (unit.unitType === "Division") expect(demoCompanies.some((c) => c.key === unit.parentUnit.key), unit.key).toBe(true);
    }
  });

  it("place every customer once, in their own company", () => {
    const placed = units.flatMap((u) => (u.associates ?? []).map((a) => [a.customer.key, u.key] as const));
    expect(placed).toHaveLength(customers.length);
    expect(new Set(placed.map(([customerKey]) => customerKey)).size).toBe(customers.length);
    for (const [customerKey, unitKey] of placed) {
      const companyKey = customers.find((c) => c.key === customerKey)!.companyKey;
      const company = demoCompanies.find((c) => c.key === companyKey)!;
      expect([company.key, ...company.teams.map((t) => t.key)], customerKey).toContain(unitKey);
    }
  });

  it("give each company an owner and an admin, inherited by its teams", () => {
    for (const unit of units.filter((u) => u.unitType === "Company")) {
      const roles = unit.associates?.map((a) => [a.associateRoleAssignments[0]?.associateRole.key, a.associateRoleAssignments[0]?.inheritance]);
      expect(roles, unit.key).toEqual([
        ["owner", "Enabled"],
        ["admin", "Enabled"],
      ]);
    }
  });

  it("give each team one approver, who is also its approverIds, and senders", () => {
    for (const { teams } of companyRoles(customers)) {
      for (const team of teams) {
        const unit = units.find((u) => u.key === team.teamKey)!;
        const roles = unit.associates?.map((a) => a.associateRoleAssignments[0]?.associateRole.key) ?? [];
        expect(roles.filter((r) => r === "approver"), team.teamKey).toHaveLength(1);
        expect(roles.filter((r) => r === "sender").length, team.teamKey).toBeGreaterThan(0);
        expect(unit.custom?.fields?.approverIds?.value, team.teamKey).toEqual([team.approverKey]);
      }
    }
  });

  it("sell through the gifting store", () => {
    for (const unit of units.filter((u) => u.unitType === "Company")) expect(unit.stores, unit.key).toEqual([{ typeId: "store", key: "gifting" }]);
  });
});
