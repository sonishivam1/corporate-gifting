/**
 * Collection rules: which catalog items a collection offers at a budget.
 * commercetools product search does this filtering in the API; this is the
 * reference it is tested against, and the seed catalog uses it directly.
 */
import { withVariants } from "./catalog";
import type { GiftCollection } from "./models";
import type { Cents } from "./money";
import type { ProductView } from "./views";

type Rules = GiftCollection["rules"];

/** A collection with no rules offers everything; otherwise any matching tag, brand or SKU qualifies. */
export function matchesRules(rules: Rules, item: { sku: string; brand: string; tags: readonly string[] }): boolean {
  const { tags, brands, skus, pinnedSkus } = rules;
  if (tags.length + brands.length + skus.length + pinnedSkus.length === 0) return true;
  return (
    skus.includes(item.sku) ||
    pinnedSkus.includes(item.sku) ||
    brands.includes(item.brand) ||
    item.tags.some((t) => tags.includes(t))
  );
}

/**
 * Products with at least one available variant that matches and fits the
 * budget, narrowed to those variants, pinned products first.
 */
export function collectionItems(rules: Rules, products: readonly ProductView[], budgetCents: Cents): ProductView[] {
  const fits = products.flatMap(
    (p) =>
      withVariants(
        p,
        (v) => v.available && v.priceCents <= budgetCents && matchesRules(rules, { sku: v.sku, brand: p.brand, tags: p.tags }),
      ) ?? [],
  );
  const pinned = (p: ProductView) => (p.variants.some((v) => rules.pinnedSkus.includes(v.sku)) ? 0 : 1);
  return fits.sort((a, b) => pinned(a) - pinned(b));
}
