/**
 * The catalog from the commerce connector (ADR 0013; spike 2). The connector
 * lists, searches and reads items in the contract's neutral shape; this turns
 * them into product cards (category and occasions from tags, the default
 * variant) and keeps the product's own rules.
 *
 * Lists and searches are cached in memory for a short while: listing a whole
 * platform catalog takes a second or two. A single SKU is always read live,
 * because estimates and sends price from it.
 */
import type { CatalogConnector, CatalogItem } from "@gifting/commerce";
import {
  categoryFromTags,
  collectionItems,
  CURRENCIES,
  findVariant,
  type Occasion,
  occasionsFromTags,
  type ProductView,
  withVariants,
} from "@gifting/domain";

import { ApiError } from "../../http/errors";
import type { CatalogSource } from "./source";

export type ConnectorCatalogOptions = {
  catalog: CatalogConnector;
  /** Occasions for items whose tags name none (the fictional products carry none on the platform). */
  fallbackOccasions?: (sku: string) => readonly Occasion[] | undefined;
  ttlMs?: number;
  now?: () => number;
  onError?: (err: unknown) => void;
};

const unavailable = () => new ApiError(503, "catalog_unavailable", "The gift catalog can't be reached right now. Try again shortly.");

/** A product card, or null for an item in a currency the product doesn't sell in. */
export function toProductView(item: CatalogItem, fallbackOccasions?: ConnectorCatalogOptions["fallbackOccasions"]): ProductView | null {
  const currency = CURRENCIES.find((c) => c === item.currency);
  const first = item.variants[0];
  if (!currency || !first) return null;
  const occasions = occasionsFromTags(item.tags);
  return withVariants({
    key: item.key,
    sku: first.sku,
    name: item.name,
    brand: item.brand,
    description: item.description,
    category: categoryFromTags(item.tags),
    occasions: occasions.length ? occasions : [...(fallbackOccasions?.(first.sku) ?? [])],
    tags: item.tags,
    vendorKey: item.vendorKey,
    vendorName: item.vendorName,
    slaDays: item.slaDays,
    priceCents: first.priceCents,
    currency,
    available: first.available,
    imageUrl: first.imageUrl,
    variants: item.variants.map((v) => ({ ...v })),
  });
}

export function connectorCatalog({ catalog, fallbackOccasions, ttlMs = 60_000, now = Date.now, onError }: ConnectorCatalogOptions): CatalogSource {
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();

  /** One read per key per `ttlMs`; a failed read isn't kept, so the next call tries again. */
  function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = load().catch((err: unknown) => {
      cache.delete(key);
      onError?.(err);
      throw unavailable();
    });
    cache.set(key, { at: now(), value });
    return value;
  }

  const listing = () =>
    cached("listing", async () => {
      const byKey = new Map<string, ProductView>();
      for (const item of await catalog.listItems()) {
        const view = toProductView(item, fallbackOccasions);
        if (view) byKey.set(view.key, view);
      }
      return byKey;
    });

  return {
    products: async () => [...(await listing()).values()],

    async collectionItems(rules, budgetCents) {
      const byKey = await listing();
      const search = { tags: rules.tags, brands: rules.brands, skus: [...rules.skus, ...rules.pinnedSkus], budgetCents };
      const matches = await cached(`search:${JSON.stringify(search)}`, () => catalog.searchItems(search));
      const found = matches.flatMap((match) => {
        const product = byKey.get(match.key);
        if (!product) return [];
        const skus = match.skus;
        return skus ? [{ ...product, variants: product.variants.filter((v) => skus.includes(v.sku)) }] : [product];
      });
      // The platform's search finds the items; the product checks each variant again, on the same terms.
      return collectionItems(rules, found, budgetCents);
    },

    async variant(sku) {
      let item: CatalogItem | null;
      try {
        item = await catalog.getItem(sku);
      } catch (err) {
        onError?.(err);
        throw unavailable();
      }
      const product = item && toProductView(item, fallbackOccasions);
      return product ? findVariant([product], sku) : null;
    },
  };
}
