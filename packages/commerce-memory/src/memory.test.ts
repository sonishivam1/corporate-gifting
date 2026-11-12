import { describeConnectorConformance } from "@gifting/commerce/conformance";
import { describe, expect, it } from "vitest";

import { type CatalogItem, organizationCapabilities } from "@gifting/commerce";

import { createMemoryConnector, type MemoryOrganizations, memoryOrganizations } from "./memory";

let n = 0;
const newEmail = () => `person-${++n}@conformance.example`;

describeConnectorConformance("memory, password sign-in", { connector: () => createMemoryConnector().connector, newEmail });

describeConnectorConformance("memory, password sign-in without platform sessions", {
  connector: () => createMemoryConnector({ platformSessions: false }).connector,
  newEmail,
});

const hosted = createMemoryConnector({ signIn: "hosted" });
describeConnectorConformance("memory, hosted sign-in", { connector: () => hosted.connector, newEmail, completeHostedSignIn: hosted.completeHostedSignIn });

// Fictional items: one tin in two sizes (the bigger out of stock) and a mug.
const items: CatalogItem[] = [
  {
    key: "tin",
    name: "Butter Cookie Tin",
    brand: "North Bakery",
    description: "",
    tags: ["food"],
    vendorKey: "vendor-north-bakery",
    vendorName: "North Bakery Co.",
    slaDays: 3,
    currency: "USD",
    variants: [
      { sku: "TIN-12", label: "12 pieces", priceCents: 2800, available: true, imageUrl: null },
      { sku: "TIN-24", label: "24 pieces", priceCents: 4500, available: false, imageUrl: null },
    ],
  },
  {
    key: "mug",
    name: "Stoneware Mug",
    brand: "Brightleaf",
    description: "",
    tags: ["drink"],
    vendorKey: "vendor-brightleaf",
    vendorName: "Brightleaf Tea House",
    slaDays: 2,
    currency: "USD",
    variants: [{ sku: "MUG-1", label: "", priceCents: 3000, available: true, imageUrl: null }],
  },
];

describeConnectorConformance("memory, with a catalog", { connector: () => createMemoryConnector({ catalog: items }).connector, newEmail });

// Fictional organizations: a person who admins one company and sends in a team of another.
const organizations: MemoryOrganizations = {
  companies: [
    { key: "company-a", name: "Company A", teams: [{ key: "team-a1", name: "One", approvalThresholdCents: 50_000 }, { key: "team-a2", name: "Two", approvalThresholdCents: null }] },
    { key: "company-b", name: "Company B", teams: [{ key: "team-b1", name: "One", approvalThresholdCents: 0 }] },
  ],
  members: [
    { id: "person-1", name: "Ada Park", memberships: [{ companyKey: "company-a", role: "admin" }, { companyKey: "company-b", teamKey: "team-b1", role: "sender" }] },
    { id: "person-2", name: "Ben Ito", memberships: [{ companyKey: "company-a", teamKey: "team-a1", role: "approver" }] },
  ],
};

let teams = 0;
const organizationWrites = { companyKey: "company-a", teamKey: "team-a2", customerId: () => "person-3", newTeamKey: () => `team-a-new-${++teams}` };

describeConnectorConformance("memory, with organizations", {
  connector: () => createMemoryConnector({ organizations }).connector,
  newEmail,
  organizations: { customerId: () => "person-1" },
  organizationWrites,
});

// The same product checks against a platform that offers none of the writes: they skip, the rest passes.
describeConnectorConformance("memory, with organizations but no writes", {
  connector: () => createMemoryConnector({ organizations, writes: { members: false, teams: false, names: false } }).connector,
  newEmail,
  organizations: { customerId: () => "person-1" },
  organizationWrites,
});

describe("memory organizations", () => {
  const orgs = memoryOrganizations(organizations);

  it("lists only the company's own memberships for each member", async () => {
    expect(await orgs.members("company-b")).toEqual([{ id: "person-1", name: "Ada Park", memberships: [{ companyKey: "company-b", teamKey: "team-b1", role: "sender" }] }]);
    expect((await orgs.members("company-a")).map((m) => m.id)).toEqual(["person-1", "person-2"]);
  });

  it("returns copies, so a caller can't change the data", async () => {
    const [first] = await orgs.membershipsOf("person-1");
    first!.role = "owner";
    expect((await orgs.membershipsOf("person-1"))[0]!.role).toBe("admin");
  });
});

describe("memory organization writes", () => {
  it("offers each part unless told not to, and reports the capabilities", () => {
    expect(organizationCapabilities(createMemoryConnector({ organizations }).connector)).toEqual({ manageMembers: true, manageTeams: true, editName: true });
    expect(organizationCapabilities(createMemoryConnector({ organizations, writes: { teams: false } }).connector)).toEqual({ manageMembers: true, manageTeams: false, editName: true });
    expect(organizationCapabilities(createMemoryConnector({ writes: { names: false } }).connector)).toEqual({ manageMembers: false, manageTeams: false, editName: false });
  });

  it("works on its own copy, so two connectors never share changes", async () => {
    const one = memoryOrganizations(organizations);
    const two = memoryOrganizations(organizations);
    await one.memberWrites!.addRole("person-9", { companyKey: "company-a", role: "owner" });
    expect(await one.membershipsOf("person-9")).toEqual([{ companyKey: "company-a", role: "owner" }]);
    expect(await two.membershipsOf("person-9")).toEqual([]);
    expect(organizations.members.map((m) => m.id)).toEqual(["person-1", "person-2"]);
  });

  it("refuses a role of the wrong shape, and names a new member from the platform's customer", async () => {
    const memory = createMemoryConnector({ organizations });
    const registered = await memory.connector.accounts.register!({ email: "cy@a.example", password: "x", firstName: "Cy", lastName: "Lane" });
    if (!("customer" in registered)) throw new Error("duplicate");
    const writes = memory.connector.organizations!.memberWrites!;
    expect(await writes.addRole(registered.customer.id, { companyKey: "company-a", teamKey: "team-a1", role: "owner" })).toBe(false);
    expect(await writes.addRole(registered.customer.id, { companyKey: "company-a", role: "sender" })).toBe(false);
    expect(await writes.addRole(registered.customer.id, { companyKey: "company-a", teamKey: "team-a1", role: "sender" })).toBe(true);
    const members = await memory.connector.organizations!.members("company-a");
    expect(members.find((m) => m.id === registered.customer.id)).toMatchObject({ name: "Cy Lane", email: "cy@a.example" });
  });
});
