import { describe, expect, it } from "vitest";

import { demoCollections, demoCompanies, demoCompany, demoDirectory, demoTopUps, products, vendors } from "./index";

describe("seed data", () => {
  it("has 3 to 5 vendors, each with products", () => {
    expect(vendors.length).toBeGreaterThanOrEqual(3);
    expect(vendors.length).toBeLessThanOrEqual(5);
    for (const vendor of vendors) {
      expect(products.some((p) => p.vendorKey === vendor.key), vendor.key).toBe(true);
    }
  });

  it("links every product to a known vendor", () => {
    const keys = new Set(vendors.map((v) => v.key));
    for (const product of products) expect(keys.has(product.vendorKey), product.sku).toBe(true);
  });

  it("uses unique SKUs and integer cents", () => {
    expect(new Set(products.map((p) => p.sku)).size).toBe(products.length);
    for (const product of products) {
      expect(Number.isInteger(product.priceCents) && product.priceCents > 0, product.sku).toBe(true);
    }
  });

  it("uses only .example domains", () => {
    for (const vendor of vendors) expect(vendor.contactEmail, vendor.key).toMatch(/@[a-z0-9-]+\.example$/);
  });

  it("can fill a $50 collection from at least three vendors", () => {
    const under50 = products.filter((p) => p.priceCents <= 5000);
    expect(new Set(under50.map((p) => p.vendorKey)).size).toBeGreaterThanOrEqual(3);
  });

  it("uses commercetools-safe keys", () => {
    for (const key of [...vendors.map((v) => v.key), ...demoCompanies.flatMap((c) => [c.key, ...c.teams.map((t) => t.key)])]) {
      expect(key).toMatch(/^[a-z0-9-]{2,256}$/);
    }
  });

  it("has unique company and team keys, with .example domains", () => {
    const keys = demoCompanies.flatMap((c) => [c.key, ...c.teams.map((t) => t.key)]);
    expect(new Set(keys).size).toBe(keys.length);
    for (const company of demoCompanies) expect(company.domain, company.key).toMatch(/\.example$/);
  });
});

describe("demo company", () => {
  it("is the first demo company, with the same teams", () => {
    const [first] = demoCompanies;
    expect(demoCompany.key).toBe(first!.key);
    expect(demoCompany.teams.map((t) => [t.key, t.name])).toEqual(first!.teams.map((t) => [t.key, t.name]));
  });

  it("has an approver on every team who isn't its only sender", () => {
    for (const team of demoCompany.teams) {
      expect(team.approverIds.length, team.key).toBeGreaterThan(0);
      const senders = demoCompany.members.filter((m) => m.teams.some((t) => t.teamKey === team.key && t.role === "sender"));
      expect(senders.some((s) => !team.approverIds.includes(s.id as never)), team.key).toBe(true);
    }
  });

  it("gives every collection items from at least two vendors at its band", () => {
    for (const collection of demoCollections) {
      const { tags } = collection.rules;
      const fits = products.filter((p) => p.priceCents <= collection.budgetBandCents && (tags.length === 0 || p.tags.some((t) => tags.includes(t))));
      expect(new Set(fits.map((p) => p.vendorKey)).size, collection.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses only .example addresses in the directory, each once", () => {
    for (const person of demoDirectory) expect(person.email, person.id).toMatch(/^[a-z.]+@lumenlabs\.example$/);
    expect(new Set(demoDirectory.map((p) => p.email)).size).toBe(demoDirectory.length);
  });

  it("funds only demo teams", () => {
    const teams = new Set<string>(demoCompany.teams.map((t) => t.key));
    for (const topUp of demoTopUps) expect(teams.has(topUp.teamKey), topUp.paymentRef).toBe(true);
  });
});
