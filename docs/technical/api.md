# Gifting API

Fastify, under `/v1` ([ADR 0010](../architecture/decisions/0010-api-versioning.md)).
Every route is defined with `defineRoute()` and Zod schemas. OpenAPI is
generated from them (M1).

**Errors:** always `{ "error": { "code": "snake_case", "message": "…" } }`.
Outside the caller's scope is `404`, never `403`.

## Sign-in

Every route declares who may call it, in `defineRoute({ auth })`
([ADR 0015](../architecture/decisions/0015-commerce-customer-accounts.md)):

| `auth` | Who | Without it |
| --- | --- | --- |
| `"account"` (default) | A signed-in person with a verified email. The handler gets `account`, taken from the access token, never from the request | `401 unauthenticated` (no token, or not active) |
| `"ops"` | Platform staff (verified emails in `OPS_EMAILS`) | `404 not_found`, so the route's existence doesn't leak |
| `"public"` | Anyone | — |

- **Tokens:** callers send `Authorization: Bearer <access token>`, a
  commercetools customer token from the password flow. The API introspects
  it (cached for 60 seconds).
- **Only the sender app's server calls the auth routes.** It keeps the
  tokens in an encrypted cookie.
- **Before the sign-in client is configured:** the auth routes and signed-in
  routes answer `503 auth_not_configured`.

## Built

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| GET | `/health` | public | `{ status: "ok" }` |
| GET | `/v1/meta` | public | `{ name, version, modules[] }` |
| GET | `/v1/auth/options` | public | `{ signIn: "password" \| "hosted" }`: how this deployment signs people in (its commerce connector's capability) |
| POST | `/v1/auth/register` | public | `202 { status: "check_email" }` for a new email (or a taken one not yet verified, which gets a fresh link); `409 email_taken` for an existing account. Body: `firstName, lastName, email, password, companyName?, acceptTerms: true`. Password: 10 to 128 characters, with uppercase, lowercase, a number and a special character, and not containing the email name |
| POST | `/v1/auth/verify-email` | public | `{ status: "verified" }`, or `400 invalid_token` |
| POST | `/v1/auth/resend-verification` | public | `202 { status: "check_email" }`, always |
| POST | `/v1/auth/sign-in` | public | `{ accessToken, refreshToken, expiresAt, account }`; `401 invalid_credentials`, `403 email_not_verified`, `429 too_many_attempts` |
| POST | `/v1/auth/hosted/start` | public | `{ url, state }`: the platform's sign-in page and the state to check on return. Body: `loginHint?` (an email). Hosted platforms only |
| POST | `/v1/auth/hosted/finish` | public | Like sign-in. Body: `code, state`. `400 invalid_state`, `401 sign_in_failed`, `403 email_not_verified` |
| POST | `/v1/auth/refresh` | public | `{ accessToken, refreshToken, expiresAt }`, or `401` |
| POST | `/v1/auth/sign-out` | public | `{ status: "signed_out" }`; ends the session at once, and the platform's own session |
| GET | `/v1/me` | account | `AccountView`: `id, email, firstName, lastName, companyName` (`@gifting/domain`) |
| GET | `/v1/workspace` | workspace | User, company, current team (threshold, approvers), the user's teams; `devUsers` with development sign-in |
| GET | `/v1/teams/:teamKey/balance` | workspace (member of that team) | `{ teamKey, currency, availableCents, heldCents, spentCents }`, computed from the ledger |
| GET | `/v1/catalog/products?budget&occasion&category&q` | workspace | `{ products[] }`: available items only |
| GET | `/v1/collections?budget=` | workspace | `{ collections[] }` with `itemCount` at the budget (the band when none) |
| GET | `/v1/collections/:id/items?budget=` | workspace | `{ items[] }` |
| GET | `/v1/recipients?q=` | workspace | `{ recipients[] }`: the company directory |
| POST | `/v1/campaigns/estimate` | workspace | Estimate for an unsaved send: gifts, hold, total, available, after, `needsApproval`, `short` |
| GET | `/v1/campaigns?status=all\|active\|scheduled\|pending_approval` | workspace | `{ campaigns[], funnel, counts }` (drafts are not listed) |
| POST | `/v1/campaigns` | workspace | `201 { id }`: a draft. Optional `Idempotency-Key` (UUID) becomes the id |
| GET | `/v1/campaigns/:id` | workspace | Detail, with `canDecide` for the viewer |
| POST | `/v1/campaigns/:id/estimate` | workspace | Estimate for a saved campaign |
| POST | `/v1/campaigns/:id/submit` | workspace | `{ campaignId, outcome, gifts, totalCents, links[] }` (see below) |
| POST | `/v1/campaigns/:id/approve`, `/decline` | workspace (the team's approver, not the sender) | `{ campaignId, status }` |
| GET | `/v1/campaigns/:id/gifts` | workspace | `{ gifts[] }`: recipient, status, channel, chosen SKU |

The password routes (register, verify, resend, sign-in) answer
`400 not_supported` on a platform with its own sign-in page, and the hosted
routes do on a password platform. Tokens are the API's own (encrypted,
15-minute access, 7-day session), the same on every commerce platform.

Request and response shapes are the Zod schemas in
[`packages/domain/src/views.ts`](../../packages/domain/src/views.ts),
shared with the apps.

**Workspace routes** (the dashboard's company and team scope) run on the
development session until the B2C workspace model is decided. With
`DEV_AUTH=1` outside production, the session comes from the `x-dev-user`
and `x-dev-team` headers the sender app forwards, defaulting to the demo
sender. Otherwise every workspace route answers `401 unauthenticated`.
Company and team always come from the session, never from the body. The
development headers never stand in for real sign-in: account routes
(`/v1/me` and the rest) need the API's own access token.

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

## Recipient and delivery (M3.4, M4)

The secret in the path is the credential, so `/v1/r/*` takes no session.
Opening is limited to 60 requests a minute per address and choosing to 10.
The request log records the route pattern, never the URL.

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/v1/r/:token` | link | Greeting; always 200 with `state` open, used, expired or invalid; first open marks the gift opened |
| GET | `/v1/r/:token/items`, `/items/:sku` | link | What this gift may choose from; no prices |
| POST | `/v1/r/:token/redeem` | link | `{ sku, address }` makes one order; `409 gift_used`, `409 item_unavailable`, `410 gift_expired`, `503 try_again` |
| GET | `/v1/r/:token/order` | link | Order number and status |
| POST | `/v1/gifts/:id/resend` | sender+ | New link by email; the old link stops working |
| POST | `/v1/gifts/:id/cancel` | sender+ | Gift cancelled and its hold released |

## Planned

| Method | Path | Who | Module | Milestone |
| --- | --- | --- | --- | --- |
| POST | `/v1/companies` | ops | accounts | M1 |
| GET, POST | `/v1/teams/:teamKey/members` | owner, admin | accounts | M1 |
| POST | `/v1/teams/:teamKey/top-ups` | owner, admin | ledger | M1 |
| POST | `/v1/webhooks/stripe` | Stripe (signed) | integrations | M1 |
| POST | `/v1/collections` (company collections), `?country=` on items | sender+, ops | catalog | M2 |
| GET | `/v1/campaigns/:id/links.csv` (would need links re-issued: only hashes are stored) | sender+ | channels | M3 |
| POST | `/v1/gifts/:id/extend` | sender+ | gifts | M3 |
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
