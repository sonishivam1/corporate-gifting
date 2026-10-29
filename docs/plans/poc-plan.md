# POC plan: eight milestones

**Status:** Agreed (27 Oct 2026)
**Agreed:** 27 Oct 2026 · **Built:** —

## Goal

Prove a Snappy-style corporate gifting marketplace on commercetools in eight
weeks. Fund a team, build a budget collection, send through every channel,
redeem, route to the vendor, track to delivery and settle the money, all
with 3 to 5 seeded vendors. Show that every dollar is held, captured or
released exactly once and a gift can never produce two orders. Keep the
design modular, so swag, gift cards, donations, more countries and a public
API come later without a rewrite.

## Scope

Sixteen capabilities from the [feature inventory](../product/features.md).
Not in the POC: vendor payouts, real card or ACH collection (Stripe test mode
only), multi-currency, SSO, swag and company stores, AI gift assistant,
digital gift cards and donations, thank-you notes, public API.

## Work packages

Each package gets its own step plan in this folder when it starts.

### M0 Foundations (week 1) — All, led by Shivam

| # | Package | Exit |
| --- | --- | --- |
| 0.1 | Monorepo scaffold, CI, docs ([M0 plan](m0-foundations.md)) | ✅ Builds in CI |
| 0.2 | commercetools setup scripts: store, vendor channels, custom types, subscription | `pnpm ct:apply` creates them in the sandbox |
| 0.3 | Seed 3 to 5 fictional vendors and 50 to 100 products through the Import API | Products searchable in the gifting store |
| 0.4 | Spikes 1 to 6 ([spikes](spikes.md)) | Results written up |
| 0.5 | Start A2P 10DLC registration, Slack app, Teams bot, email sending domain | Submitted, lead times known |
| 0.6 | Decide ADR 0009 (identity) and ADR 0011 (jobs) | Accepted |

### M1 Accounts and money (week 2) — Shivam

| # | Package | Exit |
| --- | --- | --- |
| 1.1 | Companies and teams as Business Units; members and roles | Ops creates a company with two teams |
| 1.2 | Identity provider sign-in; request scope from the session | A sender sees only their team |
| 1.3 | Budget accounts and the ledger service (`top-up`, balance) | Balance computed from entries |
| 1.4 | Stripe test-mode top-ups and webhook | A team is funded and its balance is correct |
| 1.5 | Integration test layer (throwaway MongoDB) | Scope and idempotency tests green |

### M2 Catalog and collections (week 3) — Bhuvaneshwari

| # | Package | Exit |
| --- | --- | --- |
| 2.1 | Collection model and rules | Platform and company collections stored |
| 2.2 | Rule resolution through product search, with cache | A $50 collection shows only eligible, in-stock items |
| 2.3 | Build-your-own collection UI in the sender app | A sender builds a collection by tag and brand |

### M3 Campaigns (week 4) — Shivam, Bhuvaneshwari

| # | Package | Exit |
| --- | --- | --- |
| 3.1 | One-time and scheduled campaigns; estimate | Estimate matches the hold formula |
| 3.2 | Approvals above threshold (approver ≠ sender) | Large campaign waits for approval |
| 3.3 | Holds on approval; fail fast when short | An approved campaign holds funds |
| 3.4 | Email channel (`.data/outbox` locally, SendGrid in cloud), links CSV, QR codes | Links emailed; CSV and QR downloadable |
| 3.5 | Gift tokens and short codes; reminders | Token hashed; reminders stop at redemption |

### M4 Redemption and fulfilment (week 5) — Chetan

| # | Package | Exit |
| --- | --- | --- |
| 4.1 | Recipient experience: unwrap, browse (no prices), choose, address | Works at 390px |
| 4.2 | Redemption: lock, cart, total check, company-balance payment, order, transaction | A gift becomes order `GFT-<giftId>` |
| 4.3 | `ct-events` consumer with dedupe; vendor routing | Order appears for the right vendor only |
| 4.4 | Vendor portal-lite: orders, mark shipped with tracking | Gift shows shipped |
| 4.5 | Stuck-claim reconciler; end-to-end test layer | Crash mid-redemption recovers |

### M5 Automation and channels (week 6) — Shivam, Chetan

| # | Package | Exit |
| --- | --- | --- |
| 5.1 | Recipient directory; CSV import; encryption of personal fields | Directory per company |
| 5.2 | One HR system through a unified HR API, nightly sync | Directory updates from the HR sandbox |
| 5.3 | Milestone worker (birthdays, anniversaries, start dates) | A birthday gift creates itself once |
| 5.4 | SMS (Twilio), Slack, Teams adapters | A birthday gift sends itself through Slack |

### M6 Money close-out and reporting (week 7) — Bhuvaneshwari

| # | Package | Exit |
| --- | --- | --- |
| 6.1 | Expiry job with releases; vendor cancel with refund and fresh hold | Expired gift nets to zero |
| 6.2 | Monthly statements; invoices for invoice-billed accounts | Statement matches entries |
| 6.3 | Hourly reconciliation with alerts | Ledger reconciles to commercetools orders |
| 6.4 | Tracking dashboard, spend reports, exports | Funnel and spend by team |

### M7 Hardening and demo (week 8) — All

| # | Package | Exit |
| --- | --- | --- |
| 7.1 | Concurrency and ledger property tests | 50 parallel claims → one order, one capture |
| 7.2 | Security pass ([security](../architecture/security.md)) | Findings fixed or recorded |
| 7.3 | Google Cloud environment (Cloud Run, Atlas on GCP, Pub/Sub, Secret Manager; [ADR 0014](../architecture/decisions/0014-google-cloud.md)) | Deployed from `main` |
| 7.4 | Demo script and fictional demo data | End-to-end demo in the cloud environment |

## Decisions

- **Modular monolith** (ADR 0004) to keep eight weeks realistic.
- **Real totals with a company-balance payment** (ADR 0005), proven in spike 1
  before M4.
- **Seeded vendors only:** vendor onboarding and payouts are business
  processes, not POC software.
- **Cut order if a milestone slips:** HR sync to CSV only; SMS and Teams shown
  as submitted; platform collections only; statements as CSV. Redemption,
  the ledger and vendor routing are never cut.

## Tests

Each milestone's exit check is demonstrated, not just claimed. The money and
redemption guarantees are tested as in [testing](../engineering/testing.md).

## Docs to update

Each package updates features, roadmap, data model, API and the build log
(see the definition of done in [CLAUDE.md](../../CLAUDE.md)).

## Changes after agreement

| # | Date | Change | Why | Agreed by |
| --- | --- | --- | --- | --- |
| 1 | 28 Oct 2026 | [Sender dashboard](sender-dashboard.md) built ahead of the spikes and M1: thin slices of balance (M1), catalog read (M2) and campaign create, estimate, submit and approve (M3), with a dev-only session instead of sign-in and a MongoDB service in CI | A working sender path to demo early, built on the real module boundaries so it carries over | Bhuvaneshwari |

## As built

Filled in milestone by milestone.
