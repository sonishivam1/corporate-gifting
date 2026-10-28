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

## Planned

| Method | Path | Who | Module | Milestone |
| --- | --- | --- | --- | --- |
| POST | `/v1/companies` | ops | accounts | M1 |
| GET | `/v1/me` | member | accounts | M1 |
| GET, POST | `/v1/teams/:teamKey/members` | owner, admin | accounts | M1 |
| GET | `/v1/teams/:teamKey/balance` | owner, admin, sender | ledger | M1 |
| POST | `/v1/teams/:teamKey/top-ups` | owner, admin | ledger | M1 |
| POST | `/v1/webhooks/stripe` | Stripe (signed) | integrations | M1 |
| GET, POST | `/v1/collections` | sender+, ops | catalog | M2 |
| GET | `/v1/collections/:id/items?country=` | sender+ | catalog | M2 |
| GET, POST | `/v1/campaigns` | sender+ | campaigns | M3 |
| POST | `/v1/campaigns/:id/estimate` | sender+ | campaigns | M3 |
| POST | `/v1/campaigns/:id/submit` | sender+ | campaigns | M3 |
| POST | `/v1/campaigns/:id/approve` | approver (not the sender) | campaigns | M3 |
| GET | `/v1/campaigns/:id/gifts` | sender+ | gifts | M3 |
| GET | `/v1/campaigns/:id/links.csv` | sender+ | channels | M3 |
| POST | `/v1/gifts/:id/resend`, `/extend`, `/cancel` | sender+ | gifts | M3 |
| GET | `/v1/r/:token` | recipient (token) | gifts | M4 |
| GET | `/v1/r/:token/items` | recipient (token) | catalog | M4 |
| POST | `/v1/r/:token/redeem` | recipient (token) | gifts | M4 |
| GET | `/v1/r/:token/order` | recipient (token) | fulfillment | M4 |
| GET | `/v1/vendor/orders` | vendor | fulfillment | M4 |
| POST | `/v1/vendor/orders/:orderNumber/ship` | vendor | fulfillment | M4 |
| GET, POST | `/v1/recipients`, `/v1/recipients/import` | admin+ | recipients | M5 |
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
