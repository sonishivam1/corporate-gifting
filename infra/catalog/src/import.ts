/**
 * Maps a catalog snapshot to Import API resources: the vendor's categories
 * under one root, one published `cookie-tin` product per storefront product
 * (every variant priced in USD for the US, with its images, the standard tax
 * category and the marketplace gift categories), and stock at the vendor's
 * supply channel. Pure, so it is tested without commercetools.
 */
import type { Attribute, CategoryImport, InventoryImport, ProductDraftImport, ProductVariantDraftImport } from "@commercetools/importapi-sdk";
import { CT_LOCALE } from "@gifting/ct";

import type { CatalogCategory, CatalogProduct, CatalogSnapshot, CatalogVariant } from "./snapshot";

/** The storefront only says "in stock", so stock is nominal. */
export const NOMINAL_STOCK = 100;

/** The tax category every product uses (ct-setup's taxCategoryDraft). */
export const TAX_CATEGORY_KEY = "standard";

/** What our marketplace adds to a vendor's products, beyond the vendor's own data. */
export type VendorGifting = {
  /** Marketplace gift categories (ct-setup's categoryDrafts), for browsing across vendors. */
  categoryKeys?: string[];
  perishable?: boolean;
  /** Country codes the vendor ships to. */
  shipsTo?: string[];
};

/** Used when an image's header couldn't be read. */
const FALLBACK_DIMENSIONS = { w: 1080, h: 1080 };

const text = (value: string) => ({ [CT_LOCALE]: value });

export function categoryImport(category: CatalogCategory): CategoryImport {
  return {
    key: category.key,
    name: text(category.name),
    slug: text(category.slug),
    ...(category.parentKey ? { parent: { typeId: "category", key: category.parentKey } } : {}),
  };
}

/** The root first, then parents before children. */
export function categoryImports(snapshot: CatalogSnapshot): CategoryImport[] {
  const depth = (c: CatalogCategory) => c.path.split("/").length;
  return [snapshot.rootCategory, ...[...snapshot.categories].sort((a, b) => depth(a) - depth(b))].map(categoryImport);
}

function variantImport(variant: CatalogVariant, product: CatalogProduct, snapshot: CatalogSnapshot, gifting: VendorGifting): ProductVariantDraftImport {
  const { attributes: a } = variant;
  const attributes: Attribute[] = [
    { type: "text", name: "brand", value: snapshot.vendor.brand },
    { type: "text", name: "vendorKey", value: snapshot.vendor.key },
    { type: "text-set", name: "tags", value: product.tags },
  ];
  if (gifting.perishable !== undefined) attributes.push({ type: "boolean", name: "perishable", value: gifting.perishable });
  if (gifting.shipsTo) attributes.push({ type: "text-set", name: "shipsTo", value: gifting.shipsTo });
  attributes.push({ type: "number", name: "leadTimeDays", value: snapshot.vendor.slaDays });
  if (a.cookieFlavor) attributes.push({ type: "text", name: "cookieFlavor", value: a.cookieFlavor });
  if (a.cookieCount) attributes.push({ type: "number", name: "cookieCount", value: a.cookieCount });
  if (a.tinColor) attributes.push({ type: "text", name: "tinColor", value: a.tinColor });
  if (a.itemType) attributes.push({ type: "text", name: "itemType", value: a.itemType });
  if (a.corporateTin !== undefined) attributes.push({ type: "boolean", name: "corporateTin", value: a.corporateTin });

  return {
    key: variant.sku,
    sku: variant.sku,
    prices: [
      {
        key: `${variant.sku}-usd-us`,
        value: { type: "centPrecision", currencyCode: variant.currency, centAmount: variant.priceCents, fractionDigits: 2 },
        country: "US",
      },
    ],
    images: variant.images.map((image) => ({
      url: image.url,
      dimensions: image.w && image.h ? { w: image.w, h: image.h } : FALLBACK_DIMENSIONS,
      ...(image.label ? { label: image.label } : {}),
    })),
    attributes,
  };
}

export function productDraftImport(product: CatalogProduct, snapshot: CatalogSnapshot, gifting: VendorGifting = {}): ProductDraftImport {
  const [master, ...rest] = product.variants.map((v) => variantImport(v, product, snapshot, gifting));
  const known = new Set([snapshot.rootCategory.key, ...snapshot.categories.map((c) => c.key)]);
  const vendorCategories = product.categoryKeys.filter((key) => known.has(key));
  const categories = [...(vendorCategories.length > 0 ? vendorCategories : [snapshot.rootCategory.key]), ...(gifting.categoryKeys ?? [])];
  return {
    key: product.key,
    productType: { typeId: "product-type", key: "cookie-tin" },
    name: text(product.name),
    slug: text(product.slug),
    ...(product.description ? { description: text(product.description) } : {}),
    ...(product.metaTitle ? { metaTitle: text(product.metaTitle) } : {}),
    ...(product.metaDescription ? { metaDescription: text(product.metaDescription) } : {}),
    categories: categories.map((key) => ({ typeId: "category", key })),
    taxCategory: { typeId: "tax-category", key: TAX_CATEGORY_KEY },
    masterVariant: master!,
    variants: rest,
    publish: true,
  };
}

export function inventoryImports(snapshot: CatalogSnapshot): InventoryImport[] {
  return snapshot.products.flatMap((product) =>
    product.variants.map((variant) => ({
      key: `${variant.sku}-${snapshot.vendor.key}`,
      sku: variant.sku,
      quantityOnStock: variant.inStock ? NOMINAL_STOCK : 0,
      supplyChannel: { typeId: "channel", key: snapshot.vendor.key },
    })),
  );
}
