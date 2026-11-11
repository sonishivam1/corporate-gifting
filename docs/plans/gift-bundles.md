# Gift bundles: the recipient gets every gift

**Status:** Built
**Agreed:** 10 Nov 2026 · **Built:** 10 Nov 2026

## Goal
Let a sender pick several products for one campaign, and have every
recipient receive all of them: a bundle. Today a campaign sends one product
(`single`) or lets the recipient choose one from a collection. A bundle is the
third option, the one parked on 30 Oct ("recipient gets all of them"). It
must keep the rules that make redemption safe: one claim, one order numbered
`GFT-<giftId>`, one company-balance payment, one capture.

## Scope

| Area | What gets built |
| --- | --- |
| Domain (`packages/domain`) | A third gift kind in `sendInput`: `{ kind: "bundle", skus: string[] }` (2 to 5 distinct SKUs). `campaign.skus` (optional, so existing documents stay valid). `giftClaim.skus` (optional). `PlaceOrderInput.items: { sku, vendorKey }[]` replacing the single `sku` and `vendorKey`. The campaign views gain `kind: "bundle"` and `skus` |
| Commerce connectors | `place()` creates one cart with one line per item, each on its own vendor's supply channel; stock is checked for every item before the cart. commercetools and memory connectors, and a conformance case for a two-vendor bundle. The order's `vendorKey` custom field is replaced by `vendorKeys` (a set); `ct:apply` adds the field |
| API (campaigns, gifts) | Estimate, approval and hold use the bundle's total price (the sum of its items) plus the usual shipping-and-tax estimate. `GET /v1/r/:token/items` returns every item in the bundle. `POST /v1/r/:token/redeem` accepts a bundle without `sku` (the field becomes optional, an additive change) |
| Sender app | The gift step's "Send a gift" lets the sender tick several products (choosing each one's option, as today). One product is a single gift; two or more make a bundle. A tray shows the picks and the total per recipient. Review and campaign detail list every item |
| Recipient app | The gift page shows "Your gifts" (every item, no prices) and one address form. Confirming orders them all. The done page lists every item |
| Not in scope | Mixing a bundle with a collection ("all of these, plus pick one"); quantities above one per item; a different bundle per person; the recipient removing items; splitting into one order per vendor (vendor routing, M4, reads each line's supply channel instead) |

## Decisions

1. **One order with several lines.** Not one order per item. This keeps
   every exactly-once guard as it is: one claim on the gift, order number
   `GFT-<giftId>`, one payment, one capture key, one ledger capture of what
   the order really cost. Vendor routing (M4) works from each line's supply
   channel, so a two-vendor bundle reaches both vendors from one order.
2. **The budget is the sum of the items' prices**, read live at estimate,
   submit and redeem, as for a single gift. The hold is that sum plus the
   shipping-and-tax estimate. Approval compares the same total.
3. **All or nothing when the recipient claims** (agreed 10 Nov). If any item
   is out of stock at redemption, nothing is ordered, the claim is released,
   and the recipient sees "One of your gifts is out of stock right now; try
   again later." Shipping only part of a bundle would quietly give the
   recipient less than the sender promised.
4. **2 to 5 items, each a different product** (5 agreed 10 Nov). Two options of the same product
   (two sizes of one tin) are refused, to keep the recipient page clear.
   Five keeps the hold and the order small enough to reason about in the
   POC.
5. **Additive API changes only.** `kind: "bundle"`, `skus` and an optional
   `sku` on redeem are new; existing `single` and `collection` requests and
   responses don't change (ADR 0010). The connector contract is internal, so
   `PlaceOrderInput` changes shape, and both connectors change with it.
6. **No new MongoDB collection.** The bundle's SKUs live on the campaign,
   and the claimed SKUs on the gift's claim.

## Open questions (answered 10 Nov 2026)

1. **Out of stock at claim:** nothing is ordered (decision 3).
2. **Item limit:** 5.
3. **Recipient app:** the recipient pages are Chetan's; Bhuvaneshwari is
   telling him about the "Your gifts" page.

## Tests

- **Domain:** `sendInput` accepts 2 to 5 distinct SKUs and refuses 1, 6,
  repeats, and two options of one product; the bundle total and hold.
- **Connectors (conformance):** a two-vendor bundle makes one order with two
  lines on the right supply channels; placing it again returns the same
  order; one item out of stock places nothing.
- **API (`app.inject()`):** the estimate and hold are the sum plus the
  estimate; approval triggers on the bundle total; the recipient sees every
  item; redeem makes one order and one capture of the order total.
- **What must be refused:** a SKU from outside the catalog or out of stock
  at send; another company's campaign; a second claim on the same bundle
  (20 parallel claims, one order); a retried capture writing nothing new; an
  out-of-stock item at claim placing no order and leaving the gift
  claimable.
- **Break and restore:** drop the per-item stock check, and drop the claim
  filter, and watch the tests fail.

## Docs to update
`docs/product/features.md`, `docs/architecture/data-model.md`,
`docs/technical/api.md`, `docs/architecture/commercetools.md` (the order's
`vendorKeys` field), `docs/engineering/writing-a-connector.md` (bundle
orders), the README progress table, `docs/product/roadmap.md`, the build log
and `CHANGELOG.md`.

## As built

Built 10 Nov 2026 on `feature/gift-bundles`. What changed from the plan:

- **The order keeps `vendorKey`.** The `gift-order` type's `vendorKey` is
  required and `ct:apply` only adds fields, so it stays (the first item's
  vendor). The new optional `vendorKeys` set lists every vendor and is
  written only on bundle orders, so single-gift orders work on a project
  whose type predates it. **Run `pnpm ct:apply` before claiming a bundle on
  a commercetools project.**
- **No conformance case.** The conformance suite has no order section yet
  and the memory connector places no orders, so the bundle cases are unit
  tests of the commercetools connector (one cart with a line per item on
  each vendor's channel; one payment; nothing written when any item is sold
  out). Orders join the conformance suite with M4.
- **One page per bundle in the recipient app**, `/r/<token>/ship`, next to
  the single-gift `/r/<token>/ship/<sku>`. The bundle's gift page lists
  every item with its description and one "Send my gifts" button, or a
  "come back later" notice while an item is out of stock.
- **Gift rows gain `orderedSkus`** (every item ordered), so campaign detail
  lists a bundle's items; `chosenSku` is unchanged (a bundle's first item).
- **The sender's "One specific gift" became "Specific gifts".** Picking one
  product sends a single gift as before; picking two to five sends a bundle.
  A tray shows each pick, its option, a remove button and the price per
  recipient.

**Verified:**
- 3 domain tests (bundle total and refusals; 2 to 5 distinct SKUs), 4 new
  commercetools connector tests, the `gift-order` type test, and 11
  integration tests: hold and estimate at the sum, approval on the bundle
  total, single gifts unchanged, the recipient sees every item with no
  price, one order with every item and one capture, a SKU in the request
  ignored, 20 parallel claims making one order, refusals (1 and 6 items, a
  repeat, an unknown or sold-out item, two options of one product) writing
  nothing, a sold-out item ordering nothing (from the catalog and from the
  platform) and the gift staying claimable, and another team's campaign
  "not found".
- Break and restore: dropping the bundle stock check fails the sold-out
  test; dropping the commercetools per-item stock check fails two connector
  tests; dropping the claim's status filter fails the parallel-claims test.
  That test first passed with the filter dropped, because the in-memory
  catalog answered too fast for the claims to overlap. The test's catalog now
  takes 5 ms per SKU, like a commercetools call, and the test also requires
  that no claim errors and the gift ends redeemed.
