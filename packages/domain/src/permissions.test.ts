import { describe, expect, it } from "vitest";

import { ACTIONS, actionsFor, can, companiesOf, type Membership, reachableTeams, rolesOnTeam } from "./permissions";

describe("what each role may do", () => {
  // The table in docs/plans/organizations-and-roles.md, decision 2.
  const expected = {
    owner: [...ACTIONS],
    admin: ACTIONS.filter((a) => a !== "campaign:approve"),
    approver: ["reports:view", "budget:view", "catalog:view", "campaign:view", "campaign:approve"],
    sender: ["reports:view", "budget:view", "catalog:view", "campaign:view", "campaign:create", "gift:manage", "collection:manage", "recipients:view", "recipients:add"],
  };

  for (const [role, actions] of Object.entries(expected)) {
    it(`${role} gets exactly its actions`, () => {
      expect(actionsFor([role])).toEqual(actions);
    });
  }

  it("lets owners and approvers decide, never admins or senders", () => {
    expect(can(["owner"], "campaign:approve")).toBe(true);
    expect(can(["approver"], "campaign:approve")).toBe(true);
    expect(can(["admin"], "campaign:approve")).toBe(false);
    expect(can(["sender"], "campaign:approve")).toBe(false);
  });

  it("keeps approvers from sending", () => {
    expect(can(["approver"], "campaign:create")).toBe(false);
    expect(can(["approver"], "gift:manage")).toBe(false);
  });

  it("combines roles, and unknown roles grant nothing", () => {
    expect(can(["approver", "sender"], "campaign:create")).toBe(true);
    expect(actionsFor(["superuser"])).toEqual([]);
    expect(actionsFor([])).toEqual([]);
  });
});

describe("roles on a team", () => {
  const memberships: Membership[] = [
    { companyKey: "lumen", role: "admin" },
    { companyKey: "lumen", teamKey: "people", role: "approver" },
    { companyKey: "other", teamKey: "ops", role: "sender" },
  ];

  it("applies company roles to every team of that company", () => {
    expect(rolesOnTeam(memberships, "lumen", "sales")).toEqual(["admin"]);
    expect(rolesOnTeam(memberships, "lumen", "people")).toEqual(["admin", "approver"]);
  });

  it("keeps team roles on their team and company", () => {
    expect(rolesOnTeam(memberships, "other", "ops")).toEqual(["sender"]);
    expect(rolesOnTeam(memberships, "other", "finance")).toEqual([]);
    expect(rolesOnTeam(memberships, "lumen", "ops")).toEqual(["admin"]);
  });

  it("ignores a company role held on a team, a team role without a team, and unknown roles", () => {
    const odd = [
      { companyKey: "c", teamKey: "t", role: "owner" },
      { companyKey: "c", role: "sender" },
      { companyKey: "c", teamKey: "t", role: "superuser" },
    ] as unknown as Membership[];
    expect(rolesOnTeam(odd, "c", "t")).toEqual([]);
  });

  it("lists companies and the teams a person may work in", () => {
    expect(companiesOf(memberships)).toEqual(["lumen", "other"]);
    expect(reachableTeams(memberships, "lumen", ["people", "sales"])).toEqual(["people", "sales"]);
    expect(reachableTeams(memberships, "other", ["finance", "ops"])).toEqual(["ops"]);
    expect(reachableTeams([], "lumen", ["people"])).toEqual([]);
  });
});
