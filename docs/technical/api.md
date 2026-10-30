# Gifting API

Fastify, under `/v1` ([ADR 0010](../architecture/decisions/0010-api-versioning.md)).
Every route is defined with `defineRoute()` and Zod schemas. OpenAPI is
generated from them (M1).

**Errors:** always `{ "error": { "code": "snake_case", "message": "…" } }`.
Outside the caller's scope is `404`, never `403`.

## Built

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| GET | `/health` | none | `{ status: "ok" }` |
| GET | `/v1/meta` | none | `{ name, version, modules[] }` |
| GET | `/v1/me` | member | User, company, current team (threshold, approvers), the user's teams; `devUsers` with development sign-in |
| GET | `/v1/teams/:teamKey/balance` | member of that team | `{ teamKey, currency, availableCents, heldCents, spentCents }`, computed from the ledger |
| GET | `/v1/catalog/products?budget&occasion&category&q` | member | `{ products[] }`: one per product, narrowed to the variants in stock (and within the budget). `sku`, `priceCents` and `imageUrl` are the default variant's (the cheapest); `variants[]` has `sku`, `label`, `priceCents`, `available`, `imageUrl`. A single-gift send takes a variant SKU |
| GET | `/v1/collections?budget=` | member | `{ collections[] }` with `itemCount` at the budget (the band when none) |
| GET | `/v1/collections/:id/items?budget=` | member | `{ items[] }`, narrowed to the variants that fit. Catalog routes answer `503 catalog_unavailable` when commercetools can't be reached |
| GET | `/v1/recipients?q=` | member | `{ recipients[] }`: the company directory |
| POST | `/v1/campaigns/estimate` | member | Estimate for an unsaved send: gifts, hold, total, available, after, `needsApproval`, `short` |
| GET | `/v1/campaigns?status=all\|active\|scheduled\|pending_approval` | member | `{ campaigns[], funnel, counts }` (drafts are not listed) |
| POST | `/v1/campaigns` | member | `201 { id }`: a draft. Optional `Idempotency-Key` (UUID) becomes the id |
| GET | `/v1/campaigns/:id` | member | Detail, with `canDecide` for the viewer |
| POST | `/v1/campaigns/:id/estimate` | member | Estimate for a saved campaign |
| POST | `/v1/campaigns/:id/submit` | member | `{ campaignId, outcome, gifts, totalCents, links[] }` (see below) |
| POST | `/v1/campaigns/:id/approve`, `/decline` | the team's approver, not the sender | `{ campaignId, status }` |
| GET | `/v1/campaigns/:id/gifts` | member | `{ gifts[] }`: recipient, status, channel, chosen SKU |

Request and response shapes are the Zod schemas in
[`packages/domain/src/views.ts`](../../packages/domain/src/views.ts),
shared with the apps.

**Sign-in (until M1):** development sign-in only. With `DEV_AUTH=1` outside
production, the session comes from the `x-dev-user` and `x-dev-team`
headers the sender app forwards, defaulting to the demo sender. Otherwise
every `/v1` route except `/v1/meta` answers `401 unauthenticated`. Company
and team always come from the session, never from the body.

**Submit:** above the team's approval threshold the campaign becomes
`pending_approval` and its gifts are created without holds. Otherwise one
transaction moves the campaign out of `draft`, creates one gift per
recipient and places one `hold` per gift. A second submit changes nothing.

| Response | When |
| --- | --- |
| `409 insufficient_funds` | The team can't cover the holds; nothing is written (submit and approve) |
| `422 item_not_eligible` | A single gift's SKU is unknown or unavailable |
| `422 collection_empty` | Nothing in the collection fits the budget |
| `422 unknown_recipient` | A recipient id isn't in the company's directory |
| `422 invalid_send_date` | A scheduled date isn't after today |
| `403 self_approval` | An approver tries to approve their own campaign |
| `409 not_pending_approval` | Approve or decline on a campaign that isn't waiting |
| `409 idempotency_key_reused` | The key was used by another team |

**Gift links** are returned once, in the submit response, when the campaign
uses the link or QR channel. Only their SHA-256 hashes are stored, so they
can't be listed again later; the sender app offers them as a CSV download
on the spot.

## Planned

| Method | Path | Who | Module | Milestone |
| --- | --- | --- | --- | --- |
| POST | `/v1/companies` | ops | accounts | M1 |
| GET, POST | `/v1/teams/:teamKey/members` | owner, admin | accounts | M1 |
| POST | `/v1/teams/:teamKey/top-ups` | owner, admin | ledger | M1 |
| POST | `/v1/webhooks/stripe` | Stripe (signed) | integrations | M1 |
| POST | `/v1/collections` (company collections), `?country=` on items | sender+, ops | catalog | M2 |
| GET | `/v1/campaigns/:id/links.csv` (would need links re-issued: only hashes are stored) | sender+ | channels | M3 |
| POST | `/v1/gifts/:id/resend`, `/extend`, `/cancel` | sender+ | gifts | M3 |
| GET | `/v1/r/:token` | recipient (token) | gifts | M4 |
| GET | `/v1/r/:token/items` | recipient (token) | catalog | M4 |
| POST | `/v1/r/:token/redeem` | recipient (token) | gifts | M4 |
| GET | `/v1/r/:token/order` | recipient (token) | fulfillment | M4 |
| GET | `/v1/vendor/orders` | vendor | fulfillment | M4 |
| POST | `/v1/vendor/orders/:orderNumber/ship` | vendor | fulfillment | M4 |
| POST | `/v1/recipients`, `/v1/recipients/import` | admin+ | recipients | M5 |
| POST | `/v1/integrations/:type/connect` | admin+ | integrations | M5 |
| GET | `/v1/reports/funnel`, `/spend`, `/exports/:kind` | sender+ | reporting | M6 |
| GET | `/v1/teams/:teamKey/statements` | owner, admin | ledger | M6 |
| POST | `/v1/ops/adjustments` | ops | ledger | M6 |

`sender+` means sender, admin or owner. Recipient routes take the gift token
in the path; they are rate-limited and behind bot protection.

## Redeem request

```json
POST /v1/r/<token>/redeem
{
  "sku": "NB-TIN-ASSORTED-12",
  "address": { "firstName": "…", "lastName": "…", "streetName": "…", "postalCode": "…", "city": "…", "state": "…", "country": "US" },
  "idempotencyKey": "3f6c…"
}
```

| Response | When |
| --- | --- |
| `200 { orderNumber }` | Redeemed (or already redeemed with the same idempotency key) |
| `409 gift_unavailable` | Already redeemed, being redeemed, expired or cancelled |
| `422 item_not_eligible` | SKU not in the collection for this country |
| `422 over_budget` | Total exceeds the hold and overage isn't allowed |
| `409 out_of_stock` | commercetools refused stock; choose again |
