import type { CatalogConnector, CatalogItem } from "@gifting/commerce";
import { memoryCatalog } from "@gifting/commerce-memory";
import { describe, expect, it, vi } from "vitest";

import { connectorCatalog, toProductView } from "./connector-source";

// Fictional items: a tin in two sizes, and a tin that is out of stock.
const item = (key: string, tags: string[], variants: CatalogItem["variants"]): CatalogItem => ({
  key,
  name: `Tin ${key}`,
  brand: "North Bakery",
  description: "",
  tags,
  vendorKey: "vendor-north-bakery",
  vendorName: "North Bakery Co.",
  slaDays: 3,
  currency: "USD",
  variants,
});

const items = [
  item("tin-a", ["food", "birthday"], [
    { sku: "A-12", label: "12 pieces", priceCents: 2800, available: true, imageUrl: null },
    { sku: "A-24", label: "24 pieces", priceCents: 4500, available: true, imageUrl: "https://img.example/a24.jpg" },
  ]),
  item("tin-b", ["food"], [{ sku: "B-12", label: "", priceCents: 3900, available: false, imageUrl: null }]),
];

/** The memory connector's catalog, with every call counted. */
function counted(overrides: Partial<CatalogConnector> = {}) {
  const base = { ...memoryCatalog(items), ...overrides };
  return {
    listItems: vi.fn(base.listItems),
    searchItems: vi.fn(base.searchItems),
    getItem: vi.fn(base.getItem),
  };
}

const none = { tags: [], brands: [], skus: [], pinnedSkus: [] };

describe("toProductView", () => {
  it("adds the category, occasions and default variant", () => {
    expect(toProductView(items[0]!)).toMatchObject({ key: "tin-a", sku: "A-12", priceCents: 2800, category: "food", occasions: ["birthday"], available: true });
  });

  it("falls back to known occasions, and drops other currencies", () => {
    expect(toProductView(items[1]!, () => ["thanks"])?.occasions).toEqual(["thanks"]);
    expect(toProductView({ ...items[0]!, currency: "EUR" })).toBeNull();
  });
});

describe("connectorCatalog", () => {
  it("lists once per minute", async () => {
    let clock = 0;
    const catalog = counted();
    const source = connectorCatalog({ catalog, now: () => clock });
    await source.products();
    await source.products();
    expect(catalog.listItems).toHaveBeenCalledTimes(1);
    clock = 60_001;
    await source.products();
    expect(catalog.listItems).toHaveBeenCalledTimes(2);
  });

  it("always reads a single SKU live", async () => {
    const catalog = counted();
    const source = connectorCatalog({ catalog });
    expect(await source.variant("A-24")).toMatchObject({ product: { key: "tin-a" }, variant: { sku: "A-24", priceCents: 4500 } });
    await source.variant("A-24");
    expect(catalog.getItem).toHaveBeenCalledTimes(2);
    expect(await source.variant("nope")).toBeNull();
  });

  it("keeps the variants the search matched, and caches the search", async () => {
    const catalog = counted();
    const source = connectorCatalog({ catalog });
    expect((await source.collectionItems(none, 3000)).map((p) => p.variants.map((v) => v.sku))).toEqual([["A-12"]]);
    await source.collectionItems(none, 3000);
    expect(catalog.searchItems).toHaveBeenCalledTimes(1);
    await source.collectionItems(none, 5000);
    expect(catalog.searchItems).toHaveBeenCalledTimes(2);
  });

  it("still enforces the budget and stock when a search returns too much", async () => {
    const catalog = counted({ searchItems: async () => [{ key: "tin-a", skus: null }, { key: "tin-b", skus: null }, { key: "gone", skus: null }] });
    const found = await connectorCatalog({ catalog }).collectionItems(none, 3000);
    expect(found.map((p) => p.variants.map((v) => v.sku))).toEqual([["A-12"]]);
  });

  it("answers 503 when the platform fails, and tries again on the next call", async () => {
    const onError = vi.fn();
    let fail = true;
    const catalog = counted({
      listItems: async () => {
        if (fail) throw new Error("socket hang up");
        return items;
      },
    });
    const source = connectorCatalog({ catalog, onError });
    await expect(source.products()).rejects.toMatchObject({ status: 503, code: "catalog_unavailable" });
    expect(onError).toHaveBeenCalledOnce();
    fail = false;
    expect(await source.products()).toHaveLength(2);
  });
});
