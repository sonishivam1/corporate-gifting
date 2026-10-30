# Week-1 spikes

**Status:** Planned
**Agreed:** 27 Oct 2026 · **Done:** —

## Goal

Settle the commercetools money path and the slow external approvals before
the build depends on them. Each spike is time-boxed to one or two days, ends
with a written result below, and is run against the commercetools sandbox
project, never production.

## Spikes

| # | Spike | Done when | Owner | Status |
| --- | --- | --- | --- | --- |
| 1 | Company-balance payment order | An order is created with real totals, a company-balance Payment with a successful Charge, and the recipient never sees a payment step | Shivam | Planned |
| 2 | Marketplace catalog | Product search returns a budget collection across 3 vendors by tag, brand, price and stock per vendor channel | Bhuvaneshwari | ✅ Done (29 Oct) |
| 3 | US tax | Tax on the recipient's address is correct for the seeded states; a tax provider chosen for production | Chetan | Planned |
| 4 | Business Units for companies and teams | Company and Division units with associate roles drive what each member can see and do | Shivam | Planned |
| 5 | Channel approvals | A2P 10DLC registration, Slack app and Teams bot are submitted, with lead times known | Chetan | Planned |
| 6 | Concurrency and ledger | 50 parallel claims on one gift produce one order and one capture | Bhuvaneshwari | Planned |

## What each spike must answer

### 1. Company-balance payment order
- Can an order be created from a cart with a Payment whose method is
  `company-balance` and a `Charge` transaction in state `Success`, with no
  customer and no PSP?
- Does `orderNumber` `GFT-<giftId>` reject a second order with the same
  number? What error comes back?
- What happens to reserved stock (`ReserveOnOrder`) when order creation fails?
- Record: the exact API calls, the errors, and the code to keep in
  `@gifting/ct`.

### 2. Marketplace catalog
- Product search query for tags, brand, price ≤ budget for a country, and
  in-stock at a supply channel. Does one query do it, or is a second
  availability check needed?
- How long does a collection of 50 to 100 products take to resolve?

### 3. US tax
- Platform tax categories and rates for 3 seeded states; `TaxMode` choice for
  the POC; what External tax mode needs from a provider later.

### 4. Business Units
- Company with two Divisions; Associate Roles for owner, admin, sender and
  approver; how the API checks a member's role on a unit; scopes for the
  `gifting-api` client.

### 5. Channel approvals
- Submitted dates and expected lead times; the fallback for the demo if one
  isn't approved by week 6.

### 6. Concurrency and ledger
- 50 parallel claims against the `findOneAndUpdate` lock (MongoDB) and 50
  parallel order creations with the same order number (commercetools).
- Confirms the ledger's unique idempotency key under a retry storm.

## Results

Filled in as each spike finishes: what we tried, what worked, what didn't,
the decision, and links to the code kept.

| # | Result | Decision | Date |
| --- | --- | --- | --- |
| 1 | — | — | — |
| 2 | One product search resolves a collection exactly; stock needs a per-vendor `or` | Keep it: search for ids, cached projections for details ([below](#spike-2-marketplace-catalog)) | 29 Oct 2026 |
| 3 | — | — | — |
| 4 | — | — | — |
| 5 | — | — | — |
| 6 | — | — | — |

### Spike 2: marketplace catalog

Run against the POC project (261 products, 453 variants, 5 vendor channels)
with `pnpm --filter @gifting/api catalog:check`. Plan:
[marketplace catalog](marketplace-catalog.md).

- **One query is enough.** For every demo collection, a single product
  search found exactly the products the rules select when applied in memory
  to the whole catalog: 192, 5, 220, 4 and 196 products. With
  `markMatchingVariants` it is exact per variant too (checked 30 Oct at
  budgets of $25, $50 and $75).
- **The query** (`collectionSearchQuery` in `packages/ct/src/catalog.ts`):
  `and` of `variants.prices.centAmount` up to the budget; an `or` over vendors
  of `variants.attributes.vendorKey = <vendor>` and
  `variants.availability.isOnStockForChannel = <its channel id>`; and, when
  the collection has rules, an `or` of `variants.attributes.tags` (`set_text`),
  `variants.attributes.brand` and `variants.sku`. `markMatchingVariants`
  says which variants fit.
- **Stock is per channel.** `variants.availability.isOnStock` finds nothing,
  because every inventory entry sits at a supply channel.
  `availability.channels.*` can't be queried; `isOnStockForChannel` can.
- **Timings:** a collection search takes 0.3 to 1.1 s. Search with product
  projections attached took 3.3 s for 100 products, so search returns ids
  only. Listing all published projections takes 1 to 2.2 s, so the API
  caches the listing for 60 s and reads one SKU live (0.3 s) to price an
  estimate or a send.
- **Error met:** a channel predicate needs `roles contains any ("InventorySupply")`;
  `roles contains "InventorySupply"` is a syntax error.
- **For M2:** occasions aren't an attribute; they come from storefront tags
  and, for the fictional products, from the seed file. An `occasions`
  attribute belongs with build-your-own collections. Searches are cached per
  process; a shared cache waits for more than one API instance.
