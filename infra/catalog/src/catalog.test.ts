// Tests use a made-up storefront page: no real brand data in the repository.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CHRISTIE_GIFTING, CHRISTIE_ROOT_CATEGORY, CHRISTIE_VENDOR, linkCategories, pageCategories, productFromPage, productLinks } from "./christie";
import { findObjects, flightRows } from "./flight";
import { imageSize } from "./image-size";
import { categoryImports, inventoryImports, NOMINAL_STOCK, productDraftImport } from "./import";
import { type CatalogProduct, type CatalogSnapshot, catalogSnapshotSchema } from "./snapshot";

const flight = [
  `1:{"productId":"Maple Tin Small","slug":"maple-tin-12","name":"Maple Tin, 12","description":"<p>Twelve cookies</p>","metaTitle":"Maple Tin","categories":"$2","variants":"$5"}`,
  `2:["$3","$4"]`,
  `3:{"categoryId":"shop_by_tin","name":"Shop by Tin","slug":"shop-by-tin","depth":1,"_url":"/diplay_categories/shop-by-tin"}`,
  `4:{"categoryId":"Small","name":"Small","slug":"small","depth":2,"_url":"/diplay_categories/shop-by-tin/small"}`,
  `5:[{"sku":"1001","price":{"centAmount":2900,"currencyCode":"USD","fractionDigits":2},"images":["https://img.example/a.jpg","https://img.example/b.jpg"],"imagesAltText":["A tin"],"isOnStock":true,"attributes":{"cookie_flavor":{"key":"f","label":"Classic"},"assortment_count":{"key":"12","label":"12"},"tin_color":{"key":"t","label":"Silver"},"itemType":"RT","isCorporateTin":false}},{"sku":"1002","price":{"centAmount":0,"currencyCode":"USD"}},{"sku":"1003","price":{"centAmount":3100,"currencyCode":"USD"},"images":["https://img.example/c.jpg"],"imagesAltText":[null],"isOnStock":false}]`,
  `6:{"productId":"Unpriced","slug":"unpriced-tin","name":"Unpriced","variants":[{"sku":"9"}]}`,
  `7:{"note":"$$5 is text"}`,
].join("\n");
const html = `<a href="/p/maple-tin-12">x</a><a href="/p/other-tin">y</a><script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;
const rows = flightRows(html);

function sample(): { snapshot: CatalogSnapshot; product: CatalogProduct } {
  const result = productFromPage(rows, "maple-tin-12");
  if ("skip" in result) throw new Error(result.skip);
  const snapshot = catalogSnapshotSchema.parse({
    source: "https://shop.example",
    extractedAt: "2026-10-28T12:00:00.000Z",
    vendor: CHRISTIE_VENDOR,
    rootCategory: CHRISTIE_ROOT_CATEGORY,
    categories: linkCategories(result.categories),
    products: [result.product],
    skipped: [],
  });
  return { snapshot, product: snapshot.products[0]! };
}

describe("flight payload", () => {
  it("reads rows and resolves references", () => {
    const [product] = findObjects(rows, ["productId", "variants"]).filter((p) => p.slug === "maple-tin-12");
    expect((product?.categories as { name: string }[]).map((c) => c.name)).toEqual(["Shop by Tin", "Small"]);
    expect(findObjects(rows, ["note"])[0]?.note).toBe("$5 is text");
  });

  it("finds product links", () => {
    expect(productLinks(html)).toEqual(["maple-tin-12", "other-tin"]);
  });
});

describe("storefront product", () => {
  it("becomes a catalog product with prefixed SKUs and integer cents", () => {
    const { product } = sample();
    expect(product.key).toBe("cc-maple-tin-12");
    expect(product.variants.map((v) => [v.sku, v.priceCents, v.inStock])).toEqual([
      ["CC-1001", 2900, true],
      ["CC-1003", 3100, false],
    ]);
    expect(product.variants[0]?.attributes).toEqual({ cookieFlavor: "Classic", cookieCount: 12, tinColor: "Silver", itemType: "RT", corporateTin: false });
    expect(product.variants[0]?.images).toEqual([{ url: "https://img.example/a.jpg", label: "A tin" }, { url: "https://img.example/b.jpg" }]);
    expect(product.variants[1]?.images).toEqual([{ url: "https://img.example/c.jpg" }]);
    expect(product.tags).toEqual(["food", "sweet", "cookies", "shop-by-tin", "small"]);
  });

  it("is skipped when the page has no product or no priced variant", () => {
    expect(productFromPage(rows, "missing")).toEqual({ skip: "no product data on the page" });
    expect(productFromPage(rows, "unpriced-tin")).toEqual({ skip: "no variant with a USD price" });
  });
});

describe("categories", () => {
  it("hang from their parent path, and top-level ones from the vendor root", () => {
    const storefrontRoot = { key: "christie-display-categories", name: "Display Categories", slug: "christie-display-categories", path: "/diplay_categories" };
    const linked = linkCategories([storefrontRoot, ...pageCategories(rows)]);
    expect(linked.map((c) => [c.key, c.parentKey, c.slug])).toEqual([
      ["christie-shop-by-tin", "christie-cookie", "christie-shop-by-tin"],
      ["christie-small", "christie-shop-by-tin", "christie-shop-by-tin-small"],
    ]);
  });

  it("import the root first and parents before children", () => {
    const { snapshot } = sample();
    expect(categoryImports(snapshot).map((c) => [c.key, c.parent?.key])).toEqual([
      ["christie-cookie", undefined],
      ["christie-shop-by-tin", "christie-cookie"],
      ["christie-small", "christie-shop-by-tin"],
    ]);
  });
});

describe("import mapping", () => {
  it("makes a published cookie-tin product with every variant, priced for the US", () => {
    const { snapshot, product } = sample();
    const draft = productDraftImport(product, snapshot);
    expect(draft.productType).toEqual({ typeId: "product-type", key: "cookie-tin" });
    expect(draft.publish).toBe(true);
    expect([draft.masterVariant?.sku, ...(draft.variants ?? []).map((v) => v.sku)]).toEqual(["CC-1001", "CC-1003"]);
    expect(draft.masterVariant?.prices?.[0]).toMatchObject({ value: { currencyCode: "USD", centAmount: 2900 }, country: "US" });
    expect(draft.categories?.map((c) => c.key)).toEqual(["christie-shop-by-tin", "christie-small"]);
  });

  it("carries images, with a fallback size when the header couldn't be read", () => {
    const { snapshot, product } = sample();
    product.variants[0]!.images[0]!.w = 800;
    product.variants[0]!.images[0]!.h = 600;
    const images = productDraftImport(product, snapshot).masterVariant?.images;
    expect(images?.map((i) => i.dimensions)).toEqual([{ w: 800, h: 600 }, { w: 1080, h: 1080 }]);
  });

  it("sets the marketplace, gifting and tin attributes", () => {
    const { snapshot, product } = sample();
    const names = productDraftImport(product, snapshot, CHRISTIE_GIFTING).masterVariant?.attributes?.map((a) => a.name);
    expect(names).toEqual(["brand", "vendorKey", "tags", "perishable", "shipsTo", "leadTimeDays", "cookieFlavor", "cookieCount", "tinColor", "itemType", "corporateTin"]);
  });

  it("adds the standard tax category and the marketplace gift category", () => {
    const { snapshot, product } = sample();
    const draft = productDraftImport(product, snapshot, CHRISTIE_GIFTING);
    expect(draft.taxCategory).toEqual({ typeId: "tax-category", key: "standard" });
    expect(draft.categories?.map((c) => c.key)).toEqual(["christie-shop-by-tin", "christie-small", "gifts-food-treats"]);
  });

  it("stocks in-stock SKUs at the vendor channel and out-of-stock ones at zero", () => {
    const { snapshot } = sample();
    expect(inventoryImports(snapshot).map((i) => [i.sku, i.quantityOnStock, i.supplyChannel?.key])).toEqual([
      ["CC-1001", NOMINAL_STOCK, "vendor-christie-cookie"],
      ["CC-1003", 0, "vendor-christie-cookie"],
    ]);
  });

  it("never gives the vendor a real contact address", () => {
    expect(CHRISTIE_VENDOR.contactEmail).toMatch(/\.example$/);
  });
});

describe("image size", () => {
  it("reads PNG and JPEG headers", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    expect(imageSize(png)).toEqual({ w: 640, h: 480 });

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80, 0x03]);
    expect(imageSize(jpeg)).toEqual({ w: 1920, h: 1080 });
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});

describe("client data", () => {
  it("stays out of git", () => {
    const gitignore = readFileSync(path.resolve(import.meta.dirname, "../../../.gitignore"), "utf8");
    expect(gitignore.split("\n")).toContain(".data/");
  });
});
