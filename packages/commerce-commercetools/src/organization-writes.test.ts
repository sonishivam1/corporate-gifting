import type { BusinessUnit } from "@commercetools/platform-sdk";
import { describe, expect, it } from "vitest";

import type { CtApi } from "@gifting/ct";

import { addRoleAction, createCtOrganizationWrites, divisionName, removeRoleAction } from "./organization-writes";

// Fictional units: just the fields the writes read.
const CUST = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const assigned = (id: string, roles: string[]) => ({
  customer: { typeId: "customer", id },
  associateRoleAssignments: roles.map((key) => ({ associateRole: { typeId: "associate-role", key }, inheritance: "Disabled" })),
});

/** The fake changes units in place, so its copies drop commercetools' read-only marks. */
type Unit = { -readonly [K in keyof BusinessUnit]: BusinessUnit[K] };

function units(): Map<string, Unit> {
  const company = { key: "company-a", version: 1, unitType: "Company", status: "Active", name: "Company A", topLevelUnit: { key: "company-a" }, associates: [assigned(OTHER, ["owner"])] };
  const team = { key: "team-a1", version: 1, unitType: "Division", status: "Active", name: "Company A · One", topLevelUnit: { key: "company-a" }, associates: [assigned(CUST, ["sender", "buyer"])] };
  const foreign = { key: "team-b1", version: 1, unitType: "Division", status: "Active", name: "Company B · One", topLevelUnit: { key: "company-b" }, associates: [] };
  return new Map(Object.entries({ "company-a": company, "team-a1": team, "team-b1": foreign }) as [string, Unit][]);
}

/** A fake commercetools for Business Units: reads, updates (applying the add, change and remove actions), creates; `conflicts` version conflicts first. */
function fakeApi(store = units(), conflicts = 0) {
  const posted: { key: string; actions: { action: string }[] }[] = [];
  const created: Record<string, unknown>[] = [];
  const notFound = Object.assign(new Error("not found"), { statusCode: 404 });
  const api = {
    businessUnits: () => ({
      withKey: ({ key }: { key: string }) => ({
        get: () => ({
          execute: async () => {
            const unit = store.get(key);
            if (!unit) throw notFound;
            return { body: structuredClone(unit) };
          },
        }),
        post: ({ body }: { body: { version: number; actions: { action: string; associate?: BusinessUnit["associates"][number]; customer?: { id: string }; name?: string }[] } }) => ({
          execute: async () => {
            const unit = store.get(key)!;
            if (conflicts > 0) {
              conflicts -= 1;
              unit.version += 1;
              throw Object.assign(new Error("conflict"), { statusCode: 409, body: { errors: [{ code: "ConcurrentModification" }] } });
            }
            if (body.version !== unit.version) throw new Error("stale version sent");
            posted.push({ key, actions: body.actions });
            for (const action of body.actions) {
              if (action.action === "addAssociate") unit.associates.push(action.associate!);
              if (action.action === "changeAssociate") unit.associates = unit.associates.map((a) => (a.customer.id === action.associate!.customer.id ? action.associate! : a));
              if (action.action === "removeAssociate") unit.associates = unit.associates.filter((a) => a.customer.id !== action.customer!.id);
              if (action.action === "changeName") unit.name = action.name!;
            }
            unit.version += 1;
            return { body: structuredClone(unit) };
          },
        }),
      }),
      post: ({ body }: { body: Record<string, unknown> & { key: string } }) => ({
        execute: async () => {
          created.push(body);
          const unit = { ...body, version: 1, status: "Active", topLevelUnit: { key: "company-a" }, associates: [] } as unknown as Unit;
          store.set(body.key, unit);
          return { body: unit };
        },
      }),
    }),
  };
  return { api: api as unknown as CtApi, store, posted, created };
}

describe("commercetools role actions", () => {
  const team = units().get("team-a1")! as unknown as BusinessUnit;

  it("adds an associate, adds a role to one, and sends nothing for a role already held", () => {
    expect(addRoleAction(team, OTHER, "approver")).toMatchObject({ action: "addAssociate", associate: { customer: { id: OTHER }, associateRoleAssignments: [{ associateRole: { key: "approver" }, inheritance: "Disabled" }] } });
    // Keeps roles the product doesn't know ("buyer").
    expect(addRoleAction(team, CUST, "approver")).toMatchObject({
      action: "changeAssociate",
      associate: { associateRoleAssignments: [{ associateRole: { key: "sender" } }, { associateRole: { key: "buyer" } }, { associateRole: { key: "approver" } }] },
    });
    expect(addRoleAction(team, CUST, "sender")).toBeNull();
  });

  it("company roles reach the company's teams in commercetools, as member:add writes them", () => {
    const company = units().get("company-a")! as unknown as BusinessUnit;
    expect(addRoleAction(company, CUST, "admin")).toMatchObject({ associate: { associateRoleAssignments: [{ associateRole: { key: "admin" }, inheritance: "Enabled" }] } });
  });

  it("takes one role away, removes the associate with their last, and sends nothing for a role not held", () => {
    expect(removeRoleAction(team, CUST, "sender")).toMatchObject({ action: "changeAssociate", associate: { associateRoleAssignments: [{ associateRole: { key: "buyer" } }] } });
    const onlySender = { ...team, associates: [assigned(CUST, ["sender"])] } as unknown as BusinessUnit;
    expect(removeRoleAction(onlySender, CUST, "sender")).toEqual({ action: "removeAssociate", customer: { typeId: "customer", id: CUST } });
    expect(removeRoleAction(team, CUST, "approver")).toBeNull();
    expect(removeRoleAction(team, OTHER, "sender")).toBeNull();
  });
});

describe("commercetools organization writes", () => {
  it("gives a role on the right unit, idempotently, and refuses another company's team", async () => {
    const { api, store, posted } = fakeApi();
    const { memberWrites } = createCtOrganizationWrites(api);
    expect(await memberWrites.addRole(OTHER, { companyKey: "company-a", teamKey: "team-a1", role: "approver" })).toBe(true);
    expect(await memberWrites.addRole(OTHER, { companyKey: "company-a", teamKey: "team-a1", role: "approver" })).toBe(true);
    expect(posted).toHaveLength(1);
    expect(store.get("team-a1")!.associates.map((a) => a.customer.id)).toEqual([CUST, OTHER]);
    expect(await memberWrites.addRole(OTHER, { companyKey: "company-a", teamKey: "team-b1", role: "sender" })).toBe(false);
    expect(await memberWrites.addRole(OTHER, { companyKey: "company-z", role: "admin" })).toBe(false);
    // A role of the wrong shape never reaches commercetools.
    expect(await memberWrites.addRole(OTHER, { companyKey: "company-a", teamKey: "team-a1", role: "owner" })).toBe(false);
    expect(posted).toHaveLength(1);
  });

  it("refuses an Inactive company and its teams", async () => {
    const store = units();
    store.get("company-a")!.status = "Inactive";
    const { memberWrites, teamWrites } = createCtOrganizationWrites(fakeApi(store).api);
    expect(await memberWrites.addRole(OTHER, { companyKey: "company-a", teamKey: "team-a1", role: "sender" })).toBe(false);
    expect(await teamWrites.createTeam("company-a", { key: "team-a9", name: "Nine" })).toBeNull();
  });

  it("tries again from a fresh read when the unit's version moved on, and gives up after 3 tries", async () => {
    const twice = fakeApi(units(), 2);
    expect(await createCtOrganizationWrites(twice.api).memberWrites.removeRole(CUST, { companyKey: "company-a", teamKey: "team-a1", role: "sender" })).toBe(true);
    expect(twice.posted).toHaveLength(1);
    const always = fakeApi(units(), 3);
    await expect(createCtOrganizationWrites(always.api).memberWrites.removeRole(CUST, { companyKey: "company-a", teamKey: "team-a1", role: "sender" })).rejects.toThrow("conflict");
  });

  it("creates a team as a Division named like the seed's, reports a taken key, and renames", async () => {
    const { api, created, store } = fakeApi();
    const { teamWrites } = createCtOrganizationWrites(api);
    expect(await teamWrites.createTeam("company-a", { key: "team-a2", name: "Two" })).toEqual({ key: "team-a2", name: "Two", approvalThresholdCents: null });
    expect(created[0]).toMatchObject({ unitType: "Division", key: "team-a2", name: "Company A · Two", parentUnit: { typeId: "business-unit", key: "company-a" } });
    expect(await teamWrites.createTeam("company-a", { key: "team-a1", name: "Again" })).toEqual({ conflict: true });
    expect(await teamWrites.renameTeam("company-a", "team-a1", "First")).toMatchObject({ key: "team-a1", name: "First" });
    expect(store.get("team-a1")!.name).toBe(divisionName("Company A", "First"));
    expect(await teamWrites.renameTeam("company-a", "team-b1", "Not ours")).toBeNull();
  });
});
