/**
 * Collection rules: which catalog items a collection offers at a budget.
 * commercetools product search does this filtering in the API; this is the
 * reference it is tested against, and the seed catalog uses it directly.
 */
import { z } from "zod";

import { withVariants } from "./catalog";
import type { GiftCollection } from "./models";
import type { Cents } from "./money";
import type { ProductView } from "./views";

type Rules = GiftCollection["rules"];

/** What a company collection may hold (plan: build-your-own-collection.md). */
export const COLLECTION_LIMITS = { name: 120, tags: 20, brands: 20, skus: 200, minBandCents: 500, maxBandCents: 50_000 } as const;

const ruleList = (max: number, what: string) =>
  z
    .array(z.string().trim().min(1).max(120))
    .max(max, { error: `Up to ${max} ${what}.` })
    .transform((items) => [...new Set(items)]);

/**
 * A company collection as a sender builds it: tags, brands and picked
 * products (variant SKUs). An item is in it when it matches any of them.
 * Empty rules would offer the whole catalog, so at least one is required.
 */
export const collectionInput = z
  .object({
    name: z.string().trim().min(1, { error: "Give the collection a name." }).max(COLLECTION_LIMITS.name),
    budgetBandCents: z.number().int().min(COLLECTION_LIMITS.minBandCents).max(COLLECTION_LIMITS.maxBandCents),
    rules: z.object({
      tags: ruleList(COLLECTION_LIMITS.tags, "tags"),
      brands: ruleList(COLLECTION_LIMITS.brands, "brands"),
      skus: ruleList(COLLECTION_LIMITS.skus, "products"),
    }),
  })
  .refine(({ rules }) => rules.tags.length + rules.brands.length + rules.skus.length > 0, {
    error: "Add at least one tag, brand or product.",
    path: ["rules"],
  });
export type CollectionInput = z.infer<typeof collectionInput>;

/** The stored rules for an input: picked products are `skus`; company collections pin nothing. */
export const rulesFromInput = (input: CollectionInput): Rules => ({ ...input.rules, pinnedSkus: [] });

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
