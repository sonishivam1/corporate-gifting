import { describe, expect, it } from "vitest";

import { inventoryImport, productDraftImport, slugFor } from "./import";
import { products } from "./index";

describe("catalog import mapping", () => {
  const product = products[0]!;

  it("makes a published gift-item draft keyed by SKU", () => {
    const draft = productDraftImport(product);
    expect(draft.key).toBe(product.sku);
    expect(draft.productType).toEqual({ typeId: "product-type", key: "gift-item" });
    expect(draft.publish).toBe(true);
    expect(draft.name).toEqual({ "en-US": product.name });
    expect(draft.masterVariant?.sku).toBe(product.sku);
  });

  it("prices in integer cents, USD, for the US", () => {
    const price = productDraftImport(product).masterVariant?.prices?.[0];
    expect(price?.value).toEqual({ type: "centPrecision", currencyCode: "USD", centAmount: product.priceCents, fractionDigits: 2 });
    expect(price?.country).toBe("US");
  });

  it("sets the brand, vendorKey and tags attributes the product type defines", () => {
    const attributes = productDraftImport(product).masterVariant?.attributes ?? [];
    expect(attributes.map((a) => a.name)).toEqual(["brand", "vendorKey", "tags"]);
    expect(attributes.find((a) => a.name === "vendorKey")?.value).toBe(product.vendorKey);
  });

  it("stocks each SKU at its vendor's supply channel", () => {
    const entry = inventoryImport(product);
    expect(entry.supplyChannel).toEqual({ typeId: "channel", key: product.vendorKey });
    expect(entry.quantityOnStock).toBe(product.stock);
  });

  it("gives every product a unique slug", () => {
    const slugs = products.map((p) => slugFor(p.sku));
    expect(new Set(slugs).size).toBe(products.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });
});
