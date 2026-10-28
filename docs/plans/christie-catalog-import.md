# Christie Cookie catalog import

**Status:** Built (not yet committed)
**Agreed:** 28 Oct 2026, source B · **Built:** 28 Oct 2026

## Goal

Put the client's real catalog into the POC commercetools project, so the
demo shows Christie Cookie's own tins next to the fictional vendors. It
comes in as one more vendor (a supply channel), through the same Import API
path as the seed. Christie Cookie has given written permission to use their
catalog for the POC. The real data never goes into git.

## What we know about the source

Checked on 28 Oct 2026, reading a handful of pages:

- Their storefront is a Next.js site on commercetools. Product images are
  served from `images.cdn.us-central1.gcp.commercetools.com`, so the
  catalog already lives in a commercetools project.
- There are about **160 product pages** (`/p/<slug>`) under the main
  categories: shop by tin, shop by treat, shop by occasion, holiday and
  corporate. The product sitemap is empty (last updated 2023).
- Each product page carries schema.org `Product` data: name, an HTML
  description, one image, the item number (`mpn`), the USD price and
  whether it's in stock. A `BreadcrumbList` gives the category path.
- Tin sizes (12, 18 and so on) are separate pages with their own price, not
  variants of one product.
- `robots.txt` blocks `/api`, `/search`, `/cart` and `/__preview`. Product
  and category pages are open. Their terms forbid scraping without written
  permission, which is why the permission must be on record.

## Scope

| Part | What it does |
| --- | --- |
| Source A (preferred): their commercetools project | A read-only API client from Christie Cookie (`view_products`, `view_categories`). We read published product projections and get their real SKUs, variants, prices, categories and image URLs exactly |
| Source B (fallback): their public pages | Only if source A isn't possible. Reads the product URLs from the category pages, then each product page's schema.org data. One request every 2 seconds, a user agent that names us, only `/p/` and `/category/` pages |
| Snapshot file | Either source writes `.data/catalogs/christie-cookie.json` (gitignored): vendor details plus products in the `SeedProduct` shape, with a description and image URL added |
| Import | `pnpm catalog:import christie-cookie` creates the `vendor-christie-cookie` channel if missing, then imports the products and stock through the Import API, using the seed's mapping |
| Remove | `pnpm catalog:remove christie-cookie` deletes that vendor's products, stock and channel, so the client's data can be withdrawn at any time |

**Not in scope:**
- Personalised and custom tins, and gift cards: they need options we don't
  model.
- Promotions and sale prices.
- Nutrition data.
- Keeping the catalog in sync. It's a one-off snapshot, re-run by hand.

## Decisions

| Decision | Why |
| --- | --- |
| Christie Cookie is a vendor, `vendor-christie-cookie`, brand "Christie Cookie Co." | Matches the marketplace design: every brand ships through its own supply channel |
| Prefer their commercetools project to their website | Exact data, no HTML parsing, and no load on their storefront |
| The data lives in `.data/` (gitignored), never in `infra/seed`, tests, docs or screenshots | CLAUDE.md keeps demo data in the repo fictional. The code is committed; the client's data is not |
| SKU `CC-<item number>`, falling back to `CC-<slug>` | Stable keys, so re-running updates the same products instead of adding new ones |
| One product per page (source B) | Each tin size has its own price and item number. Grouping sizes into variants is left until we read their real model (source A) |
| Categories become tags (`birthday`, `thank-you`, `holiday`, `workplace` …) | Budget collections select by tag; no category tree is needed for the POC |
| Images link to their CDN URLs; nothing is copied | Simplest, and nothing extra is stored |
| Stock is a nominal 100 per SKU | The site only says "in stock". The real numbers come from Christie Cookie if the demo needs them |
| Prices go through `toCents` | Integer cents, as everywhere else |

## Tests

- The mapping, with a fictional fixture page:
  - schema.org data becomes a `SeedProduct` with integer cents and the right
    tags;
  - a page with no price or no item number is skipped and reported;
  - duplicate pages (the same product under two categories) give one
    product.
- The import refuses to run without the setup guard
  (`CTP_SETUP_PROJECT_KEY`).
- A test checks that `.data/` is in `.gitignore`.
- In the project after import:
  - the `vendor-christie-cookie` products are published with USD prices for
    the US;
  - stock sits at the vendor's channel;
  - a re-run changes nothing;
  - `catalog:remove` leaves none behind.

## Docs to update

- CLAUDE.md "Demo data": the exception for client catalogs kept in `.data/`.
- [commercetools design](../architecture/commercetools.md): catalog import.
- [configuration](../technical/configuration.md): any new variables
  (source A's client settings).
- Build log and this plan's **As built** section.

## To record

- **Who gave the written permission, and when:** to be recorded here.
- **Source A:** will Christie Cookie create a read-only API client for us?
  If not, we use source B.

## As built

Built on 28 Oct 2026 from the public pages (source B), at Shivam's request.
What changed from the plan:

- **The data came from the page payload, not schema.org.** Every product page
  embeds the storefront's own product record in its Next.js flight payload:
  key, name, HTML description, SEO title and description, category names and
  paths, and every variant's SKU, price, images with alt text, stock flag and
  attributes. `src/flight.ts` reads that payload. Category pages carry the
  whole category tree the same way.
- **Variants are tin colours, not sizes.** A page is one product whose
  variants are its tin colours (brushed metal, red satin, cream satin), each
  with its own SKU and images. Sizes are separate products. Every variant is
  kept.
- **A `cookie-tin` product type**, created by `ct:apply`. It has the three
  marketplace attributes (same definitions as `gift-item`) plus
  `cookieFlavor`, `cookieCount`, `tinColor`, `itemType` and `corporateTin`.
- **Categories are imported too, not only tags.** Their 51 categories sit
  under our root category `christie-cookie`, with keys `christie-…`. Products
  also get tags from their category slugs, for collections.
- **Image sizes are real.** Images link to their CDN. The extractor reads the
  first 256 KB of each image to get its width and height.
- **Crawl:**
  - The first crawl read 348 pages in about 28 minutes, at one page a second.
  - A parser bug skipped 66 real products whose images had null alt text.
    `--retry-skipped` re-read only the skipped pages (112, about 13 minutes).
  - The 46 pages still skipped are truncated links found in page text
    (`/p/youre-one-toug`, `/p/18-triple-c` …), plus one server error. None is
    a real product.
- **The import waits for unresolved references.** Products reference
  categories created in the same run, so some operations are `unresolved`
  until their category exists. `runImport` keeps waiting while the
  imported count still grows.
- **250 fictional demo customers** were added to the seed, about one per
  product, at the user's request. They're generated, not taken from any site
  (`infra/seed/src/customers.ts`).

**Verified in the project, read back through the HTTP API:**

| What | Count |
| --- | --- |
| Christie Cookie products, published | 249 |
| Variants (SKUs), all with a US price in USD | 441 |
| Images, every variant has at least one | 1,369 |
| Price range | $20.00 to $325.00 |
| Stock entries at `vendor-christie-cookie` | 441 (100 each; the storefront shows all in stock) |
| Categories (root and 51) | 52 |
| Customers | 250 |

- Import summaries: 742 of 742 operations imported for the catalog, and 274
  of 274 for the seed (12 products, 12 stock entries, 250 customers).
- Re-running the import updates in place: it was run three times, and the
  counts didn't change.
- Package checks: tests, lint and typecheck pass.

**Not done:**
- `catalog:remove` is written but has not been run, so the data stays in
  place.
- Product search indexing is off in the project, so the search API returns
  nothing yet. Spike 2 turns it on.
- The written permission's details are still to be recorded below.
