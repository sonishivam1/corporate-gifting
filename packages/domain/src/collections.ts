/**
 * Collection rules: which catalog items a collection offers at a budget.
 * Today the API resolves them over the seed catalog; in M2 commercetools
 * product search does the filtering and this stays the reference for tests.
 */
import type { GiftCollection } from "./models";
import type { Cents } from "./money";

export type CollectionCandidate = {
  sku: string;
  brand: string;
  tags: readonly string[];
  priceCents: Cents;
  available: boolean;
};

type Rules = GiftCollection["rules"];

/** A collection with no rules offers everything; otherwise any matching tag, brand or SKU qualifies. */
export function matchesRules(rules: Rules, item: Pick<CollectionCandidate, "sku" | "brand" | "tags">): boolean {
  const { tags, brands, skus, pinnedSkus } = rules;
  if (tags.length + brands.length + skus.length + pinnedSkus.length === 0) return true;
  return (
    skus.includes(item.sku) ||
    pinnedSkus.includes(item.sku) ||
    brands.includes(item.brand) ||
    item.tags.some((t) => tags.includes(t))
  );
}

/** Available items that match and fit the budget, pinned items first. */
export function collectionItems<T extends CollectionCandidate>(rules: Rules, items: readonly T[], budgetCents: Cents): T[] {
  const fits = items.filter((i) => i.available && i.priceCents <= budgetCents && matchesRules(rules, i));
  const pinned = (i: T) => (rules.pinnedSkus.includes(i.sku) ? 0 : 1);
  return fits.sort((a, b) => pinned(a) - pinned(b));
}
