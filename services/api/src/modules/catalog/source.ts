/**
 * Where products come from. The commerce platform owns them (ADR 0013):
 * `connectorCatalog` reads them through the connector; `seedCatalog` serves
 * `infra/seed` when the connector has no catalog (tests, CI, local work).
 * Products are read, never copied into MongoDB.
 */
import {
  type Cents,
  collectionItems,
  findVariant,
  type GiftCollection,
  type ProductView,
  type VariantView,
} from "@gifting/domain";
import { products, vendors } from "@gifting/seed";

export interface CatalogSource {
  /** Every product card. May be a few seconds old: lists only. */
  products(): Promise<ProductView[]>;
  /** What a collection offers at a budget, narrowed to the variants that fit, pinned first. */
  collectionItems(rules: GiftCollection["rules"], budgetCents: Cents): Promise<ProductView[]>;
  /** The product and variant for a SKU, read live: estimates and sends price from this. */
  variant(sku: string): Promise<{ product: ProductView; variant: VariantView } | null>;
}

const vendorByKey = new Map(vendors.map((v) => [v.key, v]));

export const seedProducts: readonly ProductView[] = products.map((p) => {
  const vendor = vendorByKey.get(p.vendorKey);
  if (!vendor) throw new Error(`Seed product ${p.sku} has no vendor.`);
  const variant: VariantView = { sku: p.sku, label: "", priceCents: p.priceCents, available: p.stock > 0, imageUrl: null };
  return {
    key: p.sku,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    description: p.description,
    category: p.category,
    occasions: p.occasions,
    tags: p.tags,
    vendorKey: vendor.key,
    vendorName: vendor.name,
    slaDays: vendor.slaDays,
    priceCents: p.priceCents,
    currency: "USD",
    available: variant.available,
    imageUrl: null,
    variants: [variant],
  };
});

/** A catalog held in memory: the seed file, or products a test supplies. */
export function memoryCatalog(items: readonly ProductView[]): CatalogSource {
  return {
    products: async () => [...items],
    collectionItems: async (rules, budgetCents) => collectionItems(rules, items, budgetCents),
    variant: async (sku) => findVariant(items, sku),
  };
}

export const seedCatalog = memoryCatalog(seedProducts);

/** The seed file's occasions by SKU: the fictional products carry none in commercetools yet. */
export const seedOccasions = new Map(products.map((p) => [p.sku, p.occasions]));
