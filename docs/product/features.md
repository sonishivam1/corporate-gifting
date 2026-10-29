# Feature inventory

The full scope of the POC, area by area. **Status** is what exists in the code
today: Built, Scaffolded (the app or module exists, the feature does not) or
Planned (nothing yet). **Milestone** is when it is built
([POC plan](../plans/poc-plan.md)). **Later** means designed for, but outside
the POC.

## Summary

Twenty capabilities across ten modules. Sixteen are in the POC.

| # | Capability | Owning module | App | POC | Milestone | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Company workspace with teams and roles | Accounts | sender, ops | Yes | M1 | In progress: register and sign-in built (B2C, ADR 0015); the dashboard's workspace is the demo company until the B2C workspace model is decided |
| 2 | Per-team budgets and spend limits | Accounts + Ledger | sender | Yes | M1 | Partly built: balance computed from the ledger; demo top-ups seeded |
| 3 | Approval before large sends | Campaigns | sender | Yes | M3 | Built: approve or decline, approver ≠ sender |
| 4 | Prepaid balance, invoice and card top-ups | Billing + Ledger | sender | Yes (Stripe test mode) | M1 | Planned |
| 5 | Hold at send, true-up at claim, release at expiry | Ledger | — | Yes | M3, M4, M6 | Partly built: hold at send |
| 6 | Monthly statement | Billing | sender | Yes | M6 | Planned |
| 7 | Multi-brand catalog with vendors | Catalog (commercetools) | ops | Yes, 3 to 5 seeded vendors | M0, M2 | Seed data scaffolded |
| 8 | Budget collections (pick anything up to $X) | Collections | sender, recipient | Yes | M2 | Partly built: platform collections over the seed catalog |
| 9 | Build-your-own collection (tags, brands, pinned items) | Collections | sender | Yes | M2 | Planned |
| 10 | One-time, scheduled and automated campaigns | Campaigns + Automation | sender | Yes | M3, M5 | Partly built: one-time and scheduled (no send worker yet) |
| 11 | HR-system sync for birthdays and anniversaries | Integrations | sender | Yes: CSV plus one HR system | M5 | Planned |
| 12 | Email, SMS, Slack, Teams, links, QR codes | Channels | sender | Yes | M3, M5 | Partly built: channels chosen and recorded; links and QR codes work; nothing is delivered yet |
| 13 | Branded unwrap page and greeting | Recipient experience | recipient | Yes, theme colours and logo | M4 | Planned |
| 14 | Reminders, resend, extend, expire | Gifts + Workers | sender | Yes | M3, M6 | Planned |
| 15 | Vendor order routing and tracking | Fulfillment | vendor | Yes, vendor portal-lite | M4 | Planned |
| 16 | Tracking dashboard and exports | Reporting | sender | Yes | M6 | Partly built: the Home overview (gifts sent and chosen, expiring soon, daily activity, status breakdown, by 7, 30 or 90 days); exports planned |
| 17 | Thank-you notes | Gifts | recipient | Later | — | — |
| 18 | Guaranteed-gift fallback, digital cards, donations | Catalog + Gifts | recipient | Later | — | — |
| 19 | Public API, webhooks, Zapier | API gateway | — | Later | — | — |
| 20 | Swag, company stores, SSO, multi-currency, AI assistant | Various | — | Later | — | — |

## Apps

| App | Users | Route root | Status |
| --- | --- | --- | --- |
| Sender dashboard | Owner, admin, sender, approver | `apps/sender` (port 3000) | Partly built: Home (overview look, [plan](../plans/sender-home-redesign.md)), Browse gifts, Campaigns with search, campaign detail and the send flow ([plan](../plans/sender-dashboard.md)) |
| Recipient experience | Recipients (no account) | `apps/recipient` (port 3001), `/r/<token>` | Scaffolded |
| Vendor portal-lite | Vendor staff | `apps/vendor` (port 3002) | Scaffolded |
| Ops admin | Platform operator | `apps/ops` (port 3003) | Scaffolded |
| Gifting API | All apps | `services/api` (port 4000) | Partly built: me, balance, catalog, collections, recipients, campaigns, gifts ([API](../technical/api.md)) |
| Worker | — | `services/worker` | Scaffolded: job registry |

## Areas

### Accounts and teams — Planned (M1)
Ops creates a company; the API creates a commercetools Business Unit of type
Company with one Division per team, then invites the owner through the
identity provider. Members get a role (owner, admin, sender, approver) as an
Associate Role on the unit. Each team has approvers and an approval threshold.

### Budgets, billing and the ledger — Planned (M1, M3, M4, M6)
Each team has one budget account: prepaid, or invoice-billed with a credit
limit. Owners and admins top up by card or ACH (Stripe test mode); the
webhook writes a `top-up` entry. Sending a gift places a hold; redeeming it
releases the hold and captures the real cost plus a fee; expiry or
cancellation releases the hold. Statements are generated monthly. Details:
[money and the ledger](../architecture/money-and-ledger.md).

### Catalog and collections — Planned (M2)
Vendors are commercetools supply Channels, and every variant carries
`brand`, `vendorKey` and `tags`. A collection is a set of rules (tags, brands,
explicit SKUs, pinned items, budget band, countries). Rules resolve through
commercetools product search to items within budget, in stock at the vendor
channel, from active vendors. Results are cached per collection, country and
budget for about an hour, and re-checked live at claim. Platform collections
are curated by ops; companies build their own.

### Campaigns, approvals and automation — Planned (M3, M5)
One-time, scheduled and automated campaigns. The sender sets the collection
(or a single SKU), budget per gift, recipients (directory, CSV or a rule),
channels, message, branding and expiry. The API estimates the cost; above the
team threshold an approver must approve. On approval one hold per gift is
placed, and the campaign fails fast if funds are short. Automated campaigns
create one gift per birthday, work anniversary or start date, idempotent on
campaign, recipient and occurrence.

### Recipients — Planned (M5)
A per-company directory of name, email, phone, Slack or Teams id, birthday,
start date and team. It is filled by CSV upload or a nightly HR-system sync
through a unified HR API. Personal fields are encrypted at rest and purged
after a configurable retention period.

### Delivery channels — Channel interface scaffolded; Planned (M3, M5)
Email (SendGrid) and links and QR codes in M3. SMS (Twilio), Slack and
Microsoft Teams come in M5. Every channel implements `send`, `remind` and a
status webhook. Reminders follow a per-company cadence and stop at
redemption. Details: [channels and integrations](../architecture/integrations.md).

### Recipient experience and redemption — Planned (M4)
The unwrap page shows the greeting in the company's colours and logo. The
recipient browses the collection with no prices, chooses a variant and enters
an address. The API locks the gift, builds a commercetools cart, checks the
total fits the hold, adds a company-balance payment and creates order
`GFT-<giftId>`. Out of stock returns the recipient to choose again. The flow
is in [key flows](../architecture/flows.md#redemption).

### Vendor fulfilment — Planned (M4)
The `OrderCreated` event routes the order to the vendor that owns the line
item's supply channel. The vendor sees it in the portal and by email, then
marks it shipped with carrier and tracking. The API writes a Delivery and
Parcel to the commercetools order, and the gift becomes `shipped`. If the
vendor can't ship, the order is cancelled, the capture refunded and the gift
reopened.

### Reporting — Planned (M6)
Gift funnel (sent, opened, redeemed, shipped, delivered, expired), spend by
team and campaign, delivery status, CSV exports, and the hourly
reconciliation report for ops.
