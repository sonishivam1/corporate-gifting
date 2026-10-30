/**
 * The calls behind the catalog (spike 2). Read-only: the catalog client needs
 * `view_published_products` and `view_products` (which also cover reading
 * channels), nothing more. Mapping lives in `catalog.ts`.
 */
import type { _SearchQuery, ProductProjection } from "@commercetools/platform-sdk";
import type { CatalogMatch } from "@gifting/commerce";
import { CT_LOCALE, type CtApi } from "@gifting/ct";

import type { CatalogVendor } from "./catalog";

/** The one market the POC sells in; projections pick this price. */
const PRICE = { priceCountry: "US", priceCurrency: "USD" } as const;
const PAGE = 500;
// Product search returns at most 100 per page.
const SEARCH_PAGE = 100;

/** Vendors are the supply channels with the `vendor` custom type. */
export async function readVendors(api: CtApi): Promise<CatalogVendor[]> {
  const { body } = await api.channels().get({ queryArgs: { where: 'roles contains any ("InventorySupply")', limit: PAGE } }).execute();
  return body.results.flatMap((channel) => {
    const fields = channel.custom?.fields ?? {};
    if (!channel.key || typeof fields.contactEmail !== "string") return [];
    const slaDays = typeof fields.slaDays === "number" && fields.slaDays > 0 ? fields.slaDays : 5;
    return [{ key: channel.key, name: channel.name?.[CT_LOCALE] ?? channel.key, slaDays, channelId: channel.id }];
  });
}

/** Every published product, with US prices and stock per channel. */
export async function readProducts(api: CtApi): Promise<ProductProjection[]> {
  const all: ProductProjection[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { body } = await api
      .productProjections()
      .get({ queryArgs: { staged: false, limit: PAGE, offset, sort: "createdAt asc", ...PRICE } })
      .execute();
    all.push(...body.results);
    if (body.results.length < PAGE) return all;
  }
}

/** The published product that has this SKU, read live (for estimates and sends). */
export async function readProductBySku(api: CtApi, sku: string): Promise<ProductProjection | null> {
  const { body } = await api
    .productProjections()
    .get({
      queryArgs: { staged: false, limit: 1, where: "masterVariant(sku = :sku) or variants(sku = :sku)", "var.sku": sku, ...PRICE },
    })
    .execute();
  return body.results[0] ?? null;
}

/** The products a search matched, by id, and which of their variants (null when all did). */
export async function searchProducts(api: CtApi, query: _SearchQuery): Promise<CatalogMatch[]> {
  const hits: CatalogMatch[] = [];
  for (let offset = 0; ; offset += SEARCH_PAGE) {
    const { body } = await api
      .products()
      .search()
      .post({ body: { query, limit: SEARCH_PAGE, offset, markMatchingVariants: true } })
      .execute();
    for (const r of body.results) {
      const matched = r.matchingVariants;
      hits.push({
        key: r.id,
        skus: !matched || matched.allMatched ? null : matched.matchedVariants.flatMap((v) => (v.sku ? [v.sku] : [])),
      });
    }
    if (offset + SEARCH_PAGE >= body.total) return hits;
  }
}
