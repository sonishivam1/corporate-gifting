/**
 * Products and their variants. A product is one card; a send picks one of its
 * variants by SKU. The product's `sku`, `priceCents`, `available` and
 * `imageUrl` always describe its default variant, so a list can show a
 * "from" price without looking at the variants.
 */
import { OCCASIONS, type Occasion } from "./models";
import type { ProductCategory, ProductView, VariantView } from "./views";

/** Tags that decide a card's category, most specific first ("food" alone is the fallback). */
const CATEGORY_BY_TAG: [string, ProductCategory][] = [
  ["drink", "drink"],
  ["outdoors", "outdoors"],
  ["home", "home"],
  ["food", "food"],
];

export function categoryFromTags(tags: readonly string[]): ProductCategory {
  return CATEGORY_BY_TAG.find(([tag]) => tags.includes(tag))?.[1] ?? "food";
}

/** Storefront tags that name an occasion. Others (`under-50`, `small`) say nothing about one. */
const OCCASION_BY_TAG: [RegExp, Occasion][] = [
  [/^birthday/, "birthday"],
  [/^thank-?you/, "thanks"],
  [/^(holiday|christmas|thanksgiving)/, "holiday"],
  [/^(congratulations|graduation)/, "appreciation"],
  [/^(welcome|new-?hire)/, "newhire"],
  [/^anniversary/, "anniversary"],
];

/** The occasions a product's tags name, in the app's order. */
export function occasionsFromTags(tags: readonly string[]): Occasion[] {
  const found = new Set(tags.flatMap((tag) => OCCASION_BY_TAG.filter(([re]) => re.test(tag)).map(([, o]) => o)));
  return OCCASIONS.filter((o) => found.has(o));
}

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

export type BundleCheck = { ok: true; totalCents: number } | { ok: false; problem: "same_product" | "unavailable" };

/**
 * A bundle's items, as found in the catalog (plan: gift-bundles.md). Each must
 * be in stock and from a different product: two options of one tin would read
 * as a mistake on the recipient's page. A bundle costs the sum of its items.
 */
export function checkBundle(items: readonly { product: Pick<ProductView, "key">; variant: Pick<VariantView, "priceCents" | "available"> }[]): BundleCheck {
  if (new Set(items.map((i) => i.product.key)).size !== items.length) return { ok: false, problem: "same_product" };
  if (items.some((i) => !i.variant.available)) return { ok: false, problem: "unavailable" };
  return { ok: true, totalCents: items.reduce((sum, i) => sum + i.variant.priceCents, 0) };
}

/** "Classic Cookie Tin (24 pieces · Red tin)", or just the name for a single-variant product. */
export function variantName(product: Pick<ProductView, "name">, variant: Pick<VariantView, "label">): string {
  return variant.label ? `${product.name} (${variant.label})` : product.name;
}
