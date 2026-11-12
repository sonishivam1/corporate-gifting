import type { BusinessUnit } from "@commercetools/platform-sdk";
import { describe, expect, it } from "vitest";

import type { CtApi } from "@gifting/ct";

import { allUnits, createCtOrganizations, isCustomerId, teamName, toOrgMembers, toOrgTeam, unitMemberships, usableUnits } from "./organizations";

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

describe("commercetools organizations reads", () => {
  it("answers an id that can't be a customer's with no memberships, without asking commercetools", async () => {
    // commercetools answers 400 for a predicate on a customer id that isn't a UUID.
    const api = { businessUnits: () => { throw new Error("should not be called"); } } as unknown as CtApi;
    expect(await createCtOrganizations(api).membershipsOf("user-maya")).toEqual([]);
    expect(isCustomerId("user-maya")).toBe(false);
    expect(isCustomerId("2b6c1d6e-6a7b-4c39-9f0e-3d1c2b4a5e6f")).toBe(true);
  });
});

describe("commercetools organizations: inactive units", () => {
  const inactive = <T extends object>(unit: T) => ({ ...unit, status: "Inactive" }) as unknown as BusinessUnit;

  it("grants nothing on an Inactive unit, nor on any team of an Inactive company", () => {
    expect(usableUnits([company, team], new Set(["company-a"]))).toEqual([company, team]);
    expect(usableUnits([company, inactive(team)], new Set(["company-a"]))).toEqual([company]);
    // The company is Inactive: its teams grant nothing, even when they are Active.
    expect(usableUnits([team], new Set())).toEqual([]);
  });

  /** A fake commercetools: answers each query from `units`, a page at a time, the way the connector asks. */
  function fakeApi(units: BusinessUnit[], calls: Record<string, unknown>[] = []) {
    const api = {
      businessUnits: () => ({
        get: ({ queryArgs }: { queryArgs: Record<string, unknown> }) => ({
          execute: async () => {
            calls.push(queryArgs);
            const where = String(queryArgs.where);
            const keys = [queryArgs["var.keys"]].flat();
            const matches = units
              .filter((u) =>
                where.includes("associates(customer(id = :id))")
                  ? u.associates.some((a) => a.customer.id === queryArgs["var.id"])
                  : where.includes("key in :keys")
                    ? u.unitType === "Company" && keys.includes(u.key)
                    : u.topLevelUnit.key === queryArgs["var.key"],
              )
              .filter((u) => !queryArgs["var.after"] || u.id > String(queryArgs["var.after"]))
              .sort((a, b) => a.id.localeCompare(b.id));
            return { body: { results: matches.slice(0, Number(queryArgs.limit)) } };
          },
        }),
      }),
    };
    return api as unknown as CtApi;
  }

  const withId = (unit: BusinessUnit, id: string) => ({ ...unit, id }) as BusinessUnit;
  // Customer ids are UUIDs on commercetools (anything else is answered with no memberships before any query).
  const ADMIN = "00000000-0000-4000-8000-000000000002";
  const APPROVER = "00000000-0000-4000-8000-000000000003";
  const companyU = { ...company, associates: [associate(ADMIN, ["admin"], { email: "ben@a.example" })] } as unknown as BusinessUnit;
  const teamU = { ...team, associates: [associate(APPROVER, ["approver"], { email: "cy@a.example" }), associate(ADMIN, ["sender"])] } as unknown as BusinessUnit;

  it("leaves out an Inactive company, with its teams, from memberships, teams and members", async () => {
    // The admin holds roles on the company and its team; the approver only on the team.
    const closed = createCtOrganizations(fakeApi([withId(inactive(companyU), "u-1"), withId(teamU, "u-2")]));
    expect(await closed.membershipsOf(ADMIN)).toEqual([]);
    expect(await closed.membershipsOf(APPROVER)).toEqual([]);
    expect(await closed.company("company-a")).toBeNull();
    expect(await closed.teams("company-a")).toEqual([]);
    expect(await closed.members("company-a")).toEqual([]);

    const open = createCtOrganizations(fakeApi([withId(companyU, "u-1"), withId(teamU, "u-2")]));
    expect(await open.membershipsOf(APPROVER)).toEqual([{ companyKey: "company-a", teamKey: "team-a1", role: "approver" }]);
    expect(await open.membershipsOf(ADMIN)).toEqual([
      { companyKey: "company-a", role: "admin" },
      { companyKey: "company-a", teamKey: "team-a1", role: "sender" },
    ]);
    expect((await open.teams("company-a")).map((t) => t.key)).toEqual(["team-a1"]);
    const closedTeam = createCtOrganizations(fakeApi([withId(companyU, "u-1"), withId(inactive(teamU), "u-2")]));
    expect(await closedTeam.membershipsOf(APPROVER)).toEqual([]);
    expect(await closedTeam.membershipsOf(ADMIN)).toEqual([{ companyKey: "company-a", role: "admin" }]);
    expect(await closedTeam.teams("company-a")).toEqual([]);
  });

  it("reads every unit, a page at a time in id order, past the page size", async () => {
    const teams = Array.from({ length: 5 }, (_, i) => withId({ ...team, key: `team-a${i}` } as BusinessUnit, `u-${i}`));
    const calls: Record<string, unknown>[] = [];
    const units = await allUnits(fakeApi(teams, calls), { where: "topLevelUnit(key = :key)", vars: { "var.key": "company-a" } }, 2);
    expect(units.map((u) => u.id)).toEqual(["u-0", "u-1", "u-2", "u-3", "u-4"]);
    expect(calls.map((c) => c["var.after"] ?? null)).toEqual([null, "u-1", "u-3"]);
    expect(calls.every((c) => c.sort === "id asc")).toBe(true);
  });
});
