/**
 * Where products come from. commercetools owns them (ADR 0001): M2 swaps the
 * seed source for product search in the gifting store. Products are read,
 * never copied into MongoDB.
 */
import type { ProductView } from "@gifting/domain";
import { products, vendors } from "@gifting/seed";

export interface CatalogSource {
  products(): Promise<ProductView[]>;
  product(sku: string): Promise<ProductView | null>;
}

const vendorByKey = new Map(vendors.map((v) => [v.key, v]));

const seedProducts: ProductView[] = products.map((p) => {
  const vendor = vendorByKey.get(p.vendorKey);
  if (!vendor) throw new Error(`Seed product ${p.sku} has no vendor.`);
  return {
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
    available: p.stock > 0,
  };
});

export const seedCatalog: CatalogSource = {
  products: async () => seedProducts,
  product: async (sku) => seedProducts.find((p) => p.sku === sku) ?? null,
};
