/**
 * Products and their variants. A product is one card; a send picks one of its
 * variants by SKU. The product's `sku`, `priceCents`, `available` and
 * `imageUrl` always describe its default variant, so a list can show a
 * "from" price without looking at the variants.
 */
import type { ProductView, VariantView } from "./views";

/** The variant a send picks unless the sender chooses another: the cheapest available, else the cheapest. */
export function defaultVariant<V extends Pick<VariantView, "priceCents" | "available">>(variants: readonly V[]): V | undefined {
  const byPrice = [...variants].sort((a, b) => a.priceCents - b.priceCents);
  return byPrice.find((v) => v.available) ?? byPrice[0];
}

/**
 * The product with only the variants that pass `keep`, its default variant
 * worked out again. Null when no variant passes.
 */
export function withVariants(product: ProductView, keep: (variant: VariantView) => boolean = () => true): ProductView | null {
  const variants = product.variants.filter(keep);
  const first = defaultVariant(variants);
  if (!first) return null;
  return {
    ...product,
    sku: first.sku,
    priceCents: first.priceCents,
    available: variants.some((v) => v.available),
    imageUrl: first.imageUrl ?? product.imageUrl,
    variants,
  };
}

/** The product and variant for a SKU, wherever it sits in the list. */
export function findVariant(products: readonly ProductView[], sku: string): { product: ProductView; variant: VariantView } | null {
  for (const product of products) {
    const variant = product.variants.find((v) => v.sku === sku);
    if (variant) return { product, variant };
  }
  return null;
}

/** "Classic Cookie Tin (24 pieces · Red tin)", or just the name for a single-variant product. */
export function variantName(product: Pick<ProductView, "name">, variant: Pick<VariantView, "label">): string {
  return variant.label ? `${product.name} (${variant.label})` : product.name;
}
