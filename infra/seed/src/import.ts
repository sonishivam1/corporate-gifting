/**
 * Maps catalog products to commercetools Import API resources: one product
 * draft per SKU (type `gift-item`, published, one USD price for the US) and
 * one inventory entry at the vendor's supply channel. Pure, so the import
 * script stays a thin loop and the mapping is tested here.
 */
import type { InventoryImport, ProductDraftImport } from "@commercetools/importapi-sdk";
import { CT_LOCALE } from "@gifting/ct";

import type { SeedProduct } from "./index";

const text = (value: string) => ({ [CT_LOCALE]: value });

export function slugFor(sku: string): string {
  return sku.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function productDraftImport(product: SeedProduct): ProductDraftImport {
  return {
    key: product.sku,
    productType: { typeId: "product-type", key: "gift-item" },
    name: text(product.name),
    slug: text(slugFor(product.sku)),
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
      attributes: [
        { type: "text", name: "brand", value: product.brand },
        { type: "text", name: "vendorKey", value: product.vendorKey },
        { type: "text-set", name: "tags", value: product.tags },
      ],
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
