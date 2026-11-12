import { describe, expect, it } from "vitest";

import { ACTIONS, actionsFor, can, companiesOf, companyRolesOf, grantableRoles, isWellFormed, type Membership, reachableTeams, rolesOnTeam } from "./permissions";

describe("what each role may do", () => {
  // The table in docs/plans/organizations-and-roles.md, decision 2.
  const expected = {
    owner: [...ACTIONS],
    admin: ACTIONS.filter((a) => a !== "campaign:approve"),
    approver: ["reports:view", "budget:view", "catalog:view", "campaign:view", "campaign:approve"],
    sender: ["reports:view", "budget:view", "catalog:view", "campaign:view", "campaign:create", "gift:manage", "collection:manage", "recipients:view", "recipients:add"],
  };

  it("lets only owners and admins manage members and teams", () => {
    for (const action of ["members:manage", "teams:manage"] as const) {
      expect(["owner", "admin", "approver", "sender"].filter((r) => can([r], action)), action).toEqual(["owner", "admin"]);
    }
  });

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

describe("who may give which role", () => {
  it("lets owners give every role, admins every role but owner, and nobody else any", () => {
    expect(grantableRoles(["owner"])).toEqual(["owner", "admin", "approver", "sender"]);
    expect(grantableRoles(["admin"])).toEqual(["admin", "approver", "sender"]);
    expect(grantableRoles(["owner", "admin"])).toEqual(["owner", "admin", "approver", "sender"]);
    expect(grantableRoles(["approver"])).toEqual([]);
    expect(grantableRoles(["sender"])).toEqual([]);
    expect(grantableRoles([])).toEqual([]);
  });

  it("counts only the roles held on the company itself", () => {
    const memberships: Membership[] = [
      { companyKey: "co-a", role: "admin" },
      { companyKey: "co-a", teamKey: "t-1", role: "sender" },
      { companyKey: "co-b", role: "owner" },
      // A company role given with a team grants nothing.
      { companyKey: "co-a", teamKey: "t-1", role: "owner" },
    ];
    expect(companyRolesOf(memberships, "co-a")).toEqual(["admin"]);
    expect(companyRolesOf(memberships, "co-b")).toEqual(["owner"]);
    expect(companyRolesOf(memberships, "co-c")).toEqual([]);
  });

  it("knows a membership's right shape", () => {
    expect(isWellFormed({ companyKey: "c", role: "owner" })).toBe(true);
    expect(isWellFormed({ companyKey: "c", teamKey: "t", role: "owner" })).toBe(false);
    expect(isWellFormed({ companyKey: "c", teamKey: "t", role: "sender" })).toBe(true);
    expect(isWellFormed({ companyKey: "c", role: "approver" })).toBe(false);
  });
});
