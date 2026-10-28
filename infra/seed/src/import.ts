/**
 * Maps catalog products to commercetools Import API resources: one product
 * draft per SKU (type `gift-item`, published, one USD price for the US, the
 * standard tax category, gift categories from its tags) and one inventory
 * entry at the vendor's supply channel. Pure, so the import script stays a
 * thin loop and the mapping is tested here.
 */
import type { Attribute, InventoryImport, ProductDraftImport } from "@commercetools/importapi-sdk";
import { CT_LOCALE } from "@gifting/ct";

import { type SeedProduct, vendors } from "./index";

const text = (value: string) => ({ [CT_LOCALE]: value });

/** Tags that put a product in a marketplace gift category (keys from ct-setup's categoryDrafts). */
export const TAG_CATEGORIES: Record<string, string> = {
  food: "gifts-food-treats",
  sweet: "gifts-food-treats",
  drink: "gifts-drinks",
  home: "gifts-home",
  outdoors: "gifts-outdoors",
  wellness: "gifts-wellness",
};

/** The tax category every product uses (ct-setup's taxCategoryDraft). */
export const TAX_CATEGORY_KEY = "standard";

export function slugFor(sku: string): string {
  return sku.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function giftCategoryKeys(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => TAG_CATEGORIES[tag]).filter((key): key is string => Boolean(key)))];
}

export function productDraftImport(product: SeedProduct): ProductDraftImport {
  const vendor = vendors.find((v) => v.key === product.vendorKey);
  const attributes: Attribute[] = [
    { type: "text", name: "brand", value: product.brand },
    { type: "text", name: "vendorKey", value: product.vendorKey },
    { type: "text-set", name: "tags", value: product.tags },
    { type: "boolean", name: "perishable", value: product.perishable ?? false },
    { type: "text-set", name: "shipsTo", value: ["US"] },
  ];
  if (vendor) attributes.push({ type: "number", name: "leadTimeDays", value: vendor.slaDays });

  return {
    key: product.sku,
    productType: { typeId: "product-type", key: "gift-item" },
    name: text(product.name),
    slug: text(slugFor(product.sku)),
    description: text(product.description),
    categories: giftCategoryKeys(product.tags).map((key) => ({ typeId: "category", key })),
    taxCategory: { typeId: "tax-category", key: TAX_CATEGORY_KEY },
    masterVariant: {
      key: product.sku,
      sku: product.sku,
      prices: [
        {
          key: `${product.sku}-usd-us`,
          value: { type: "centPrecision", currencyCode: "USD", centAmount: product.priceCents, fractionDigits: 2 },
          country: "US",
        },
      ],
      attributes,
    },
    publish: true,
  };
}

export function inventoryImport(product: SeedProduct): InventoryImport {
  return {
    key: `${product.sku}-${product.vendorKey}`,
    sku: product.sku,
    quantityOnStock: product.stock,
    supplyChannel: { typeId: "channel", key: product.vendorKey },
  };
}
