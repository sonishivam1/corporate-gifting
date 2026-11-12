import { describeConnectorConformance } from "@gifting/commerce/conformance";
import { describe, expect, it } from "vitest";

import type { CatalogItem } from "@gifting/commerce";

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

describeConnectorConformance("memory, with organizations", {
  connector: () => createMemoryConnector({ organizations }).connector,
  newEmail,
  organizations: { customerId: () => "person-1" },
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
