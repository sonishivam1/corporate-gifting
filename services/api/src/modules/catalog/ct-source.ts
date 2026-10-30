/**
 * The catalog from commercetools (spike 2). Lists come from product
 * projections and collections from product search, each cached in memory for
 * a short while: reading every projection takes about a second. A single SKU
 * is always read live, because estimates and sends price from it.
 */
import type { _SearchQuery, ProductProjection } from "@commercetools/platform-sdk";
import {
  type CatalogVendor,
  collectionSearchQuery,
  type CtApi,
  type MapOptions,
  readProductBySku,
  readProducts,
  readVendors,
  type SearchHit,
  searchProducts,
  toProductView,
} from "@gifting/ct";
import { collectionItems, findVariant, type ProductView } from "@gifting/domain";

import { ApiError } from "../../http/errors";
import type { CatalogSource } from "./source";

/** The calls the catalog makes; tests pass fakes. */
export type CatalogReader = {
  vendors(): Promise<CatalogVendor[]>;
  products(): Promise<ProductProjection[]>;
  productBySku(sku: string): Promise<ProductProjection | null>;
  search(query: _SearchQuery): Promise<SearchHit[]>;
};

export function ctReader(api: CtApi): CatalogReader {
  return {
    vendors: () => readVendors(api),
    products: () => readProducts(api),
    productBySku: (sku) => readProductBySku(api, sku),
    search: (query) => searchProducts(api, query),
  };
}

export type CtCatalogOptions = {
  reader: CatalogReader;
  fallbackOccasions?: MapOptions["fallbackOccasions"];
  ttlMs?: number;
  now?: () => number;
  onError?: (err: unknown) => void;
};

type Listing = { vendors: CatalogVendor[]; byId: Map<string, ProductView>; products: ProductView[] };

export function ctCatalog({ reader, fallbackOccasions, ttlMs = 60_000, now = Date.now, onError }: CtCatalogOptions): CatalogSource {
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();

  /** One read per key per `ttlMs`; a failed read isn't kept, so the next call tries again. */
  function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = load().catch((err: unknown) => {
      cache.delete(key);
      onError?.(err);
      throw new ApiError(503, "catalog_unavailable", "The gift catalog can't be reached right now. Try again shortly.");
    });
    cache.set(key, { at: now(), value });
    return value;
  }

  const options = (vendors: CatalogVendor[]): MapOptions => ({
    vendors: new Map(vendors.map((v) => [v.key, v])),
    ...(fallbackOccasions ? { fallbackOccasions } : {}),
  });

  const listing = () =>
    cached("listing", async (): Promise<Listing> => {
      const [vendors, projections] = await Promise.all([reader.vendors(), reader.products()]);
      const byId = new Map<string, ProductView>();
      for (const p of projections) {
        const view = toProductView(p, options(vendors));
        if (view) byId.set(p.id, view);
      }
      return { vendors, byId, products: [...byId.values()] };
    });

  return {
    products: async () => (await listing()).products,

    async collectionItems(rules, budgetCents) {
      const { vendors, byId } = await listing();
      const hits = await cached(`search:${budgetCents}:${JSON.stringify(rules)}`, () =>
        reader.search(collectionSearchQuery(rules, budgetCents, vendors)),
      );
      const found = hits.flatMap((hit) => {
        const product = byId.get(hit.id);
        if (!product) return [];
        const skus = hit.skus;
        return skus ? [{ ...product, variants: product.variants.filter((v) => skus.includes(v.sku)) }] : [product];
      });
      // Search finds the products; the rules are checked again per variant, on the same terms.
      return collectionItems(rules, found, budgetCents);
    },

    async variant(sku) {
      const { vendors } = await listing();
      const projection = await reader.productBySku(sku).catch((err: unknown) => {
        onError?.(err);
        throw new ApiError(503, "catalog_unavailable", "The gift catalog can't be reached right now. Try again shortly.");
      });
      const product = projection && toProductView(projection, options(vendors));
      return product ? findVariant([product], sku) : null;
    },
  };
}
