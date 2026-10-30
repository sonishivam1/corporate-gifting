import type { ProductProjection, ProductVariant } from "@commercetools/platform-sdk";
import { describe, expect, it } from "vitest";

import { type CatalogVendor, categoryFromTags, collectionSearchQuery, occasionsFromTags, toProductView, variantLabels } from "./catalog";

// Fictional fixtures shaped like real projections; the client's catalog never goes in a test.
const bakery: CatalogVendor = { key: "vendor-north-bakery", name: "North Bakery Co.", slaDays: 3, channelId: "ch-bakery" };
const vendors = new Map([[bakery.key, bakery]]);

function variant(id: number, sku: string, cents: number | null, opts: { stock?: boolean; image?: string; attrs?: Record<string, unknown> } = {}): ProductVariant {
  return {
    id,
    sku,
    attributes: Object.entries({ vendorKey: bakery.key, brand: "North Bakery", tags: ["food", "sweet", "birthday"], ...opts.attrs }).map(([name, value]) => ({ name, value })),
    ...(cents === null ? {} : { price: { id: `p${id}`, value: { type: "centPrecision", currencyCode: "USD", centAmount: cents, fractionDigits: 2 } } }),
    images: opts.image ? [{ url: opts.image, dimensions: { w: 1, h: 1 } }] : [],
    availability: { channels: { [bakery.channelId]: { isOnStock: opts.stock ?? true, availableQuantity: opts.stock === false ? 0 : 5 } } },
  } as ProductVariant;
}

function projection(master: ProductVariant, ...variants: ProductVariant[]): ProductProjection {
  return {
    id: "id-tin",
    key: "tin",
    name: { "en-US": "Butter Cookie Tin" },
    description: { "en-US": "Baked the day it ships." },
    masterVariant: master,
    variants,
  } as unknown as ProductProjection;
}

describe("toProductView", () => {
  it("maps a single-variant product", () => {
    const view = toProductView(projection(variant(1, "NB-12", 2800, { image: "https://img.example/a.jpg" })), { vendors });
    expect(view).toMatchObject({
      key: "tin",
      sku: "NB-12",
      name: "Butter Cookie Tin",
      brand: "North Bakery",
      category: "food",
      occasions: ["birthday"],
      vendorName: "North Bakery Co.",
      slaDays: 3,
      priceCents: 2800,
      available: true,
      imageUrl: "https://img.example/a.jpg",
    });
    expect(view?.variants).toEqual([{ sku: "NB-12", label: "", priceCents: 2800, available: true, imageUrl: "https://img.example/a.jpg" }]);
  });

  it("labels variants, skips unpriced ones and defaults to the cheapest in stock", () => {
    const view = toProductView(
      projection(
        variant(1, "NB-12", 2800, { stock: false, attrs: { cookieCount: 12, tinColor: "Red" } }),
        variant(2, "NB-24", 4500, { attrs: { cookieCount: 24, cookieFlavor: "Assorted", tinColor: "Blue" } }),
        variant(3, "NB-48", null),
      ),
      { vendors },
    );
    expect(view?.variants.map((v) => [v.sku, v.label, v.available])).toEqual([
      ["NB-12", "12 pieces · Red tin", false],
      ["NB-24", "24 pieces · Assorted · Blue tin", true],
    ]);
    expect(view).toMatchObject({ sku: "NB-24", priceCents: 4500, available: true });
  });

  it("is out of stock when only another channel has stock", () => {
    const v = variant(1, "NB-12", 2800);
    const elsewhere = { ...v, availability: { channels: { "ch-other": { isOnStock: true } } } } as unknown as ProductVariant;
    expect(toProductView(projection(elsewhere), { vendors })?.available).toBe(false);
  });

  it("drops products it can't offer", () => {
    expect(toProductView(projection(variant(1, "NB-12", 2800, { attrs: { vendorKey: "vendor-unknown" } })), { vendors })).toBeNull();
    expect(toProductView(projection(variant(1, "NB-12", null)), { vendors })).toBeNull();
  });

  it("falls back to known occasions when the tags name none", () => {
    const plain = projection(variant(1, "NB-12", 2800, { attrs: { tags: ["food"] } }));
    expect(toProductView(plain, { vendors, fallbackOccasions: (sku) => (sku === "NB-12" ? ["thanks"] : undefined) })?.occasions).toEqual(["thanks"]);
    expect(toProductView(plain, { vendors })?.occasions).toEqual([]);
  });
});

describe("tags", () => {
  it("picks the most specific category", () => {
    expect(categoryFromTags(["food", "drink", "wellness"])).toBe("drink");
    expect(categoryFromTags(["outdoors", "home"])).toBe("outdoors");
    expect(categoryFromTags(["sweet"])).toBe("food");
  });

  it("reads occasions from storefront tags, in the app's order", () => {
    expect(occasionsFromTags(["holiday-gifts-under-50", "thank-you", "under-50", "graduation"])).toEqual(["holiday", "thanks", "appreciation"]);
    expect(occasionsFromTags(["small"])).toEqual([]);
  });

  it("labels variants by what differs, or by SKU when nothing does", () => {
    const red = variant(1, "T-RED", 1, { attrs: { cookieCount: 18, cookieFlavor: "Brownies", tinColor: "Red" } });
    const cream = variant(2, "T-CREAM", 1, { attrs: { cookieCount: 18, cookieFlavor: "Brownies", tinColor: "Cream" } });
    expect(variantLabels([red, cream])).toEqual(["Red tin", "Cream tin"]);
    expect(variantLabels([variant(1, "A", 1), variant(2, "B", 1)])).toEqual(["A", "B"]);
  });
});

describe("collectionSearchQuery", () => {
  const none = { tags: [], brands: [], skus: [], pinnedSkus: [] };
  const trail: CatalogVendor = { key: "vendor-trailhead", name: "Trailhead", slaDays: 5, channelId: "ch-trail" };

  it("checks the budget and stock at each vendor's own channel", () => {
    const q = collectionSearchQuery(none, 5000, [bakery, trail]) as { and: unknown[] };
    expect(q.and).toHaveLength(2);
    expect(q.and[0]).toEqual({ range: { field: "variants.prices.centAmount", lte: 5000 } });
    expect(JSON.stringify(q.and[1])).toContain('"value":"ch-trail"');
    expect((q.and[1] as { or: unknown[] }).or).toHaveLength(2);
  });

  it("matches any tag, brand or SKU, pinned SKUs included", () => {
    const q = collectionSearchQuery({ tags: ["food"], brands: ["Trailhead"], skus: ["A"], pinnedSkus: ["B"] }, 5000, [bakery]) as { and: unknown[] };
    expect(q.and[2]).toEqual({
      or: [
        { exact: { field: "variants.attributes.tags", fieldType: "set_text", values: ["food"] } },
        { exact: { field: "variants.attributes.brand", fieldType: "text", values: ["Trailhead"] } },
        { exact: { field: "variants.sku", values: ["A", "B"] } },
      ],
    });
  });
});
