# Marketplace catalog from commercetools (spike 2)

**Status:** Built (not yet committed)
**Agreed:** 29 Oct 2026 · **Built:** 29 Oct 2026

## Goal

The sender dashboard reads products from `infra/seed`. commercetools now
holds the real catalog: 249 Christie Cookie products and the 12 fictional
ones, with prices, stock at five vendor channels, images and gift
categories. This step answers [spike 2](spikes.md) and swaps the API's
catalog source to commercetools product search, so Browse gifts, the send
flow and collections show the live catalog. Price and stock are read again
from commercetools when a campaign is estimated, submitted or approved.
Nothing is copied into MongoDB ([ADR 0001](../architecture/decisions/0001-commerce-in-commercetools.md)).

## What we already know (read-only checks, 29 Oct)

| Question | Answer so far |
| --- | --- |
| Is Product Search enabled? | Yes. A one-filter query takes about 0.4 s |
| Tags and price in one query? | Yes: `variants.attributes.tags` with `variants.prices.centAmount ≤ budget` gives 191 food products under $50 in 1.3 s, and `markMatchingVariants` says which variants fit |
| In stock in one query? | Per channel only. `isOnStock` without a channel finds nothing because every inventory entry is at a supply channel; `isOnStockForChannel` works. "In stock at any vendor" is an `or` over the 5 vendor channels |
| Whole catalog with projections | 261 products in 3.3 s, too slow per page view, so listings need a short cache |
| Variants | 453 variants on 261 products; 76 products have more than one (flavour, piece count, tin colour). 441 variants have images (Cloudinary) |
| Occasions | Not an attribute. Christie tags include `birthday`, `thank-you`, `congratulations`, `graduation` and several `holiday-*` |
| Store | `gifting` has the 5 supply channels and no product selection, so it doesn't narrow products |

The spike write-up records the exact queries, timings and errors.

## Scope

| # | Piece | Where |
| --- | --- | --- |
| 1 | Spike 2 write-up: queries, timings, the stock answer, what goes to M2 | `docs/plans/spikes.md` Results |
| 2 | `ProductView` gains `imageUrl` (optional) and `variants` (sku, label, price, available), additive within v1 | `packages/domain` |
| 3 | Pure mapping: product projection → `ProductView`; gift categories and tags → `category` and `occasions`; rules → search query | `packages/ct` (`catalog.ts`), with unit tests on fictional fixtures |
| 4 | `ctCatalog`: a `CatalogSource` on product search. Listings cached in memory for 60 s; `product(sku)` always reads live | `services/api/src/modules/catalog` |
| 5 | Collection rules (tags, brands, SKUs, budget, in stock) resolved by search, not in memory, through a new `CatalogSource.search(rules)` | catalog module |
| 6 | Choosing the source: `CATALOG_SOURCE=commercetools` or `seed` (default `seed`, so tests, CI and the build need no commercetools) | `services/api/src/deps.ts`, `docs/technical/configuration.md` |
| 7 | Product images in Browse, the product sheet and the send flow, with the category icon as the fallback | `apps/sender` (`next.config` remote pattern for the image host) |
| 8 | Choosing a variant when sending one specific gift | send flow, product sheet |
| 9 | A smoke script, `pnpm --filter @gifting/api catalog:check`, that runs the real queries against the project and prints counts and timings | `services/api/scripts` |

Not in scope: building collections in the UI (M2.3), a product-search
cache shared across instances, tax and shipping in the estimate (still
open), changes to the commercetools project or the imports.

## Decisions to agree

1. **One card per product, with a variant choice.** Browse shows 261 cards,
   not 453. The card shows the lowest price ("from $28"). When sending one
   specific gift, the sender picks the variant (for example "24 pieces, red
   tin"), and the campaign stores that variant's SKU, which is what the
   order will need in M4. The alternative, one card per variant, repeats
   many Christie tins two or three times.
2. **A read-only client for the API.** The `.env` client has
   `manage_project`, which is for `ct-setup` only. The API gets its own
   client, read-only for now (`view_published_products`, `view_products`,
   `view_channels`; as built, `view_products` instead, see below), from new `CTP_API_CLIENT_ID`, `CTP_API_CLIENT_SECRET`
   and `CTP_API_SCOPES`. You create it in the Merchant Center (Settings →
   Developer settings → API clients) and put the values in `.env`. The
   other `gifting-api` scopes in the [commercetools design](../architecture/commercetools.md)
   come with M1 and M4.
3. **Occasions and categories mapped in code, not as new attributes.**
   Gift category `gifts-food-treats` → food, `gifts-drinks` → drink,
   `gifts-home` → home, `gifts-outdoors` → outdoors (wellness-only items
   fall back to their first tag). Tags `birthday` → birthday,
   `thank-you` → thanks, `holiday*` → holiday, `congratulations` and
   `graduation` → appreciation. The 12 fictional products have no
   occasion tags in commercetools, so the mapping falls back to the seed
   file's occasions for those SKUs until an `occasions` attribute is added
   (M2). This leaves the project and the imports unchanged.
4. **Stock means "on stock at any vendor channel".** The query is an `or`
   of `isOnStockForChannel` over the channels with the `vendor` type, read
   once and cached.
5. **Price is the US / USD price.** Search is called with
   `priceCountry: "US"` and `priceCurrency: "USD"`, matching the imports and
   the store's one country.
6. **The Christie data stays out of git.** Unit tests use fictional
   fixtures shaped like real responses. The real catalog is only read at
   run time and in the smoke script's console output.

## Tests

- Unit (`packages/ct`): projection mapping (price, image, variants,
  availability, category and occasion mapping); rule → query building
  (tags, brands, SKUs, budget, the channel `or`).
- Unit (`services/api`): the cache serves a listing twice with one fetch,
  and `product(sku)` never uses it.
- Integration (existing 29, seed source): still pass with the new view
  fields. New: a single-gift send with a variant SKU; a SKU that isn't in
  the catalog or is out of stock is refused (`item_not_eligible`); a
  collection whose rules match nothing is refused.
- Break and restore: drop the stock filter, and the out-of-stock test
  fails.
- Manual: `catalog:check` against the project, then Browse and a send in
  the running app with `CATALOG_SOURCE=commercetools`.
- `pnpm lint`, `typecheck`, `test`, `test:integration` and `build` pass, with
  no commercetools variables set.

## Docs to update

`docs/plans/spikes.md` (spike 2 results), `docs/architecture/commercetools.md`
(the search query and the API client), `docs/technical/api.md` (product
view fields), `docs/technical/configuration.md` (`CATALOG_SOURCE`,
`CTP_API_*`), `docs/product/features.md`, `docs/product/roadmap.md`, the
build log, and this plan's As built section.

## As built

Built on 29 Oct 2026, not yet committed. Spike results:
[spikes](spikes.md#spike-2-marketplace-catalog).

**Changes from the plan**
- The listing comes from product projections, not product search. Search
  with projections attached took 3.3 s per 100 products; projections take
  1 to 2.2 s for all 261. Search returns only ids and matching variants,
  mapped back onto the cached listing.
- The category comes from tags (`drink` > `outdoors` > `home` > `food`),
  not gift categories. Reading categories would need another scope, and
  the tags give the same answer for every product today.
- `CatalogSource` has `products()`, `collectionItems(rules, budget)` and
  `variant(sku)`. `memoryCatalog()` serves the seed file and lets tests add
  products, such as a fictional tin in three sizes.
- Variant labels keep only what differs between a product's variants
  ("Red tin", "Cream tin"), so long labels don't repeat the shared size and
  flavour.
- The sender app shows the chosen gift and its option above the gift
  grid, which can be long.

**Verified**
- Unit: `@gifting/domain` 42, `@gifting/ct` 19, API 27 tests.
- Integration: 33, including 4 new ones for variants on a separate
  throwaway database.
- Break and restore: dropping the stock check from a single-gift send, or
  from the product list, each fails a test.
- `catalog:check` against the project: 261 products, 453 variants, 5
  vendors. All five demo collections match the in-memory reference
  exactly.
- The API on commercetools (a separate instance on port 4100): listing,
  filters, collections, a variant estimate at its live price, and refusal
  of an unknown SKU. The pages render against the seed source.

**API client**
- The Merchant Center offers no channel scope. A client with
  `view_published_products` and `view_products` reads products, product
  search and the vendor channels (checked 29 Oct). The first live checks
  ran with the setup client's credentials passed in for that one run;
  nothing in the code uses the setup client for the API.
- An admin-template client can only request `manage_project`, and the API
  then gets no token (`invalid_scope`). The page then says the API or
  database didn't answer, which hides the cause.

**Not done yet**
- The pages haven't been viewed with the commercetools source, because a
  second Next.js dev server can't run beside the one on port 3000. Set
  `CATALOG_SOURCE=commercetools` and restart `pnpm dev` once the client
  exists.

**Lessons**
- Product photos come from three hosts (Cloudinary, the commercetools image
  CDN and a vendor CDN), not the one a single sample showed. `next/image`
  throws on an unlisted host and takes the page down, so the hosts live in
  `apps/sender/lib/images.ts` and any other host is shown unoptimized.
- Stock queries must name a channel when all inventory is at supply
  channels.
- Compare a search with a reference that doesn't re-check its results:
  the source filters again per variant, so "matches" alone proved nothing
  about the search.
