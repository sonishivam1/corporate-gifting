/**
 * The contract's catalog on commercetools. Vendors (supply channels) are read
 * once a minute: every search names their channel ids. Items are not cached
 * here; the product caches the listing and reads single SKUs live.
 */
import type { CatalogConnector } from "@gifting/commerce";
import type { CtApi } from "@gifting/ct";

import { type CatalogVendor, collectionSearchQuery, toCatalogItem } from "./catalog";
import { readProductBySku, readProducts, readVendors, searchProducts } from "./catalog-reader";

export function createCtCatalog(api: CtApi, options: { vendorTtlMs?: number; now?: () => number } = {}): CatalogConnector {
  const ttl = options.vendorTtlMs ?? 60_000;
  const now = options.now ?? Date.now;
  let vendors: { at: number; value: Promise<CatalogVendor[]> } | null = null;

  function loadVendors(): Promise<CatalogVendor[]> {
    if (!vendors || now() - vendors.at >= ttl) {
      const value = readVendors(api).catch((err: unknown) => {
        vendors = null;
        throw err;
      });
      vendors = { at: now(), value };
    }
    return vendors.value;
  }

  const byKey = (list: CatalogVendor[]) => new Map(list.map((v) => [v.key, v]));

  return {
    async listItems() {
      const [list, projections] = await Promise.all([loadVendors(), readProducts(api)]);
      const map = byKey(list);
      return projections.flatMap((p) => toCatalogItem(p, map) ?? []);
    },
    async searchItems(search) {
      return searchProducts(api, collectionSearchQuery(search, await loadVendors()));
    },
    async getItem(sku) {
      const [list, projection] = await Promise.all([loadVendors(), readProductBySku(api, sku)]);
      const item = projection && toCatalogItem(projection, byKey(list));
      // A variant without a US price isn't offered, so its SKU is unknown here.
      return item && item.variants.some((v) => v.sku === sku) ? item : null;
    },
  };
}
