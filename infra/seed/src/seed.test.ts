import { describe, expect, it } from "vitest";

import { demoCompany, products, vendors } from "./index";

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
    for (const key of [...vendors.map((v) => v.key), demoCompany.key, ...demoCompany.teams.map((t) => t.key)]) {
      expect(key).toMatch(/^[a-z0-9-]{2,256}$/);
    }
  });
});
