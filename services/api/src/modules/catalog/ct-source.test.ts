import type { ProductProjection } from "@commercetools/platform-sdk";
import type { CatalogVendor } from "@gifting/ct";
import { describe, expect, it, vi } from "vitest";

import { type CatalogReader, ctCatalog } from "./ct-source";

// Fictional fixtures; the client's catalog never goes in a test.
const vendor: CatalogVendor = { key: "vendor-north-bakery", name: "North Bakery Co.", slaDays: 3, channelId: "ch-bakery" };

function projection(id: string, variants: { sku: string; cents: number; stock: boolean }[]): ProductProjection {
  const [master, ...rest] = variants.map((v, i) => ({
    id: i + 1,
    sku: v.sku,
    attributes: [
      { name: "vendorKey", value: vendor.key },
      { name: "brand", value: "North Bakery" },
      { name: "tags", value: ["food"] },
      { name: "cookieCount", value: 12 * (i + 1) },
    ],
    price: { id: `p-${v.sku}`, value: { type: "centPrecision", currencyCode: "USD", centAmount: v.cents, fractionDigits: 2 } },
    images: [],
    availability: { channels: { [vendor.channelId]: { isOnStock: v.stock } } },
  }));
  return { id, key: id, name: { "en-US": `Tin ${id}` }, masterVariant: master, variants: rest } as unknown as ProductProjection;
}

const tins = [
  projection("tin-a", [
    { sku: "A-12", cents: 2800, stock: true },
    { sku: "A-24", cents: 4500, stock: true },
  ]),
  projection("tin-b", [{ sku: "B-12", cents: 3900, stock: false }]),
];

function fakeReader(overrides: Partial<CatalogReader> = {}): CatalogReader {
  return {
    vendors: vi.fn(async () => [vendor]),
    products: vi.fn(async () => tins),
    productBySku: vi.fn(async (sku: string) => tins.find((t) => [t.masterVariant, ...t.variants].some((v) => v.sku === sku)) ?? null),
    search: vi.fn(async () => [{ id: "tin-a", skus: ["A-12"] }, { id: "gone", skus: null }]),
    ...overrides,
  };
}

const none = { tags: [], brands: [], skus: [], pinnedSkus: [] };

describe("ctCatalog", () => {
  it("reads the catalog once per minute", async () => {
    let clock = 0;
    const reader = fakeReader();
    const catalog = ctCatalog({ reader, now: () => clock });
    await catalog.products();
    await catalog.products();
    expect(reader.products).toHaveBeenCalledTimes(1);
    clock = 60_001;
    await catalog.products();
    expect(reader.products).toHaveBeenCalledTimes(2);
  });

  it("maps products with their variants", async () => {
    const [a, b] = await ctCatalog({ reader: fakeReader() }).products();
    expect(a).toMatchObject({ key: "tin-a", sku: "A-12", priceCents: 2800, available: true });
    expect(a?.variants.map((v) => v.label)).toEqual(["12 pieces", "24 pieces"]);
    expect(b).toMatchObject({ sku: "B-12", available: false });
  });

  it("always reads a single SKU live", async () => {
    const reader = fakeReader();
    const catalog = ctCatalog({ reader });
    expect(await catalog.variant("A-24")).toMatchObject({ product: { key: "tin-a" }, variant: { sku: "A-24", priceCents: 4500 } });
    await catalog.variant("A-24");
    expect(reader.productBySku).toHaveBeenCalledTimes(2);
    expect(await catalog.variant("nope")).toBeNull();
  });

  it("keeps the variants search matched, and drops products it no longer lists", async () => {
    const reader = fakeReader();
    const catalog = ctCatalog({ reader });
    const items = await catalog.collectionItems(none, 5000);
    expect(items.map((p) => p.variants.map((v) => v.sku))).toEqual([["A-12"]]);
    await catalog.collectionItems(none, 5000);
    expect(reader.search).toHaveBeenCalledTimes(1);
    await catalog.collectionItems(none, 2500);
    expect(reader.search).toHaveBeenCalledTimes(2);
  });

  it("still enforces the budget and stock when search returns more", async () => {
    const reader = fakeReader({ search: vi.fn(async () => [{ id: "tin-a", skus: null }, { id: "tin-b", skus: null }]) });
    const items = await ctCatalog({ reader }).collectionItems(none, 3000);
    expect(items.map((p) => p.variants.map((v) => v.sku))).toEqual([["A-12"]]);
  });

  it("answers 503 when commercetools fails, and tries again on the next call", async () => {
    const onError = vi.fn();
    const products = vi.fn().mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValue(tins);
    const catalog = ctCatalog({ reader: fakeReader({ products }), onError });
    await expect(catalog.products()).rejects.toMatchObject({ status: 503, code: "catalog_unavailable" });
    expect(onError).toHaveBeenCalledOnce();
    expect(await catalog.products()).toHaveLength(2);
  });
});
