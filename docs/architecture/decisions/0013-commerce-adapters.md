# 0013 — Commerce through pluggable connectors: commercetools first, others when a client needs them

**Status:** Accepted (29 Oct 2026, Shivam), with section 6 on customer
accounts. It replaces parts of [0001](0001-commerce-in-commercetools.md),
[0005](0005-company-balance-payment.md) and
[0006](0006-vendors-as-supply-channels.md) (see "What changes").

**Built so far** ([plan](../../plans/commerce-connectors.md)): the contract
package `@gifting/commerce` (the interface is called `CommerceConnector`),
the conformance suite, `@gifting/commerce-memory` and
`@gifting/commerce-commercetools`, with customer accounts only. Catalog,
orders, payment and events join the contract with M2 and M4.

**Since this was written** the product became B2C, for one merchant
([ADR 0015](0015-commerce-customer-accounts.md)). Section 2 (companies,
teams, members and vendors in MongoDB) is decided again when the gifting
features are planned.

## Context

The direction from the product owner (Shivam, 28 Oct 2026):

- **The POC uses commercetools only.**
- **The product will be sold to clients who may already run another
  commerce platform**, such as Shopify or BigCommerce.
- **Connecting a client's platform should be plug and play.** We add a
  connector for that platform and configure it, without reworking the
  product.

The agreed architecture ties the product to commercetools in five places:

| Where | The tie |
| --- | --- |
| ADR 0001 | All commerce is in commercetools, including companies and teams as Business Units |
| ADR 0005 | Redemption orders are paid by a commercetools Payment with method `company-balance` |
| ADR 0006 | Vendors are commercetools supply Channels with a `vendor` custom type |
| Data model | Records hold commercetools keys (`ctOrderNumber`; `companyKey` and `teamKey` point at Business Units) |
| Flows | Collections use commercetools product search; order events come from commercetools Subscriptions |

**Why now:** no API, worker or app code calls commercetools yet. Only the
setup and import scripts in `infra/` do. Changing direction now costs days;
after M1 (companies) and M4 (redemption) it would cost weeks.

We already solved the same problem for delivery channels.
[ADR 0008](0008-channel-adapters.md) puts each provider behind the `Channel`
interface, and campaigns never import a provider SDK. This decision applies
that pattern to commerce.

## Decision

### 1. One commerce interface, one adapter per platform

A new package, `@gifting/commerce`, defines the `CommerceAdapter` interface
and the platform-neutral types it uses. Each platform gets an adapter
package; the first is `@gifting/commerce-commercetools`, built on today's
`@gifting/ct`. The API and worker modules (catalog, gifts, fulfillment,
reporting) call adapters through a registry. Only adapter packages and
`infra/` import a platform SDK.

The interface covers what the gifting flows need, no more:

| Operation | Used by | Notes |
| --- | --- | --- |
| `searchItems(query)` | Collections (M2) | Filters by tags, brands, SKUs, price up to the budget, country, and in stock at the vendor. Returns neutral `CatalogItem`s |
| `getItem(sku, country)` | Redemption | Re-reads price, stock and shippability on the server; the browser never supplies a price |
| `quote(draft)` | Redemption | Item, shipping and tax totals for the recipient's address, so we can check the total fits the hold |
| `placeOrder(order)` | Redemption | Order number `GFT-<giftId>`; idempotent on that number. Records payment by company balance (see 3). Returns `{ orderRef, totalCents }` |
| `getOrder(orderRef)`, `cancelOrder(orderRef)` | Fulfillment, reporting, refunds | |
| `parseEvent(raw)` | Worker | Turns the platform's event (commercetools Subscription, Shopify webhook …) into a neutral `OrderEvent`: created, cancelled, shipped (with tracking), delivered |
| `capabilities` | Everywhere | What this platform can do: tax calculation, stock per vendor, idempotent order numbers. Flows check these, not the platform's name |

Importing catalogs stays outside the interface. Each adapter gets its own
import tooling in `infra/`, and the catalog snapshot format
(`infra/catalog/src/snapshot.ts`) is already platform-neutral.

### 2. The platform owns companies, teams, members and vendors

Not every commerce platform has B2B units or a vendor entity, so these
become ours, in MongoDB:

- **Companies, teams and members.** Two new collections:
  - `companies`: company settings and its teams;
  - `members`: identity-provider user, company, teams and roles.

  `companyKey` and `teamKey` stay the same keys, now owned by us. This
  replaces Business Units and Associate Roles.
- **Vendors.** A new `vendors` collection: key, name, contacts, fulfilment
  method, SLA, and `commerce: { connection, ref }`. The `ref` is that
  vendor's place in its platform: a supply Channel in commercetools, a
  location or a separate shop in Shopify.
- **Commerce connection.** A deployment connects to one commerce
  platform: the client's own, or commercetools when the client has none.
  Its settings are the connector, its credentials by `secretRef`, and the
  store or market to use.

  Records name their connection, so a deployment could later hold more
  than one (vendors on different platforms) without a data migration. That
  is not built.

### 3. Payment by company balance, on any platform

[ADR 0005](0005-company-balance-payment.md) stands in substance:
- orders carry real prices, tax and shipping;
- money moves only in our ledger;
- the recipient never sees a payment step;
- an order is never zeroed with a 100% discount.

Each adapter records the order as paid by the company balance with its
platform's own offline or manual payment. In commercetools that is the
existing Payment with method `company-balance` and a successful `Charge`.
Adapters for other platforms must prove theirs in a spike.

### 4. Plug and play: what makes a connector

A connector is complete when it has all of the following:

| Part | What it is |
| --- | --- |
| Adapter package | `@gifting/commerce-<platform>`. It implements `CommerceAdapter`, declares its `capabilities`, and is the only code that imports the platform's SDK |
| Configuration | Chosen at deployment by `COMMERCE_CONNECTOR` (for example `commercetools`, `shopify`) plus that connector's settings. No module code changes to switch |
| Conformance tests | A shared suite in `@gifting/commerce` that every connector must pass against a sandbox of its platform. It covers the search filters, the server-side price re-read, the quote, `placeOrder` twice with one number giving one order, the order recorded as paid by company balance, cancel, and parsing recorded event samples. "Plug and play" means a connector that passes this suite works with the product |
| In-memory connector | `@gifting/commerce-memory` passes the same suite. Unit and API tests use it, so the product's tests never need a real platform |
| Setup tooling | What the platform needs before gifting works: a store or sales channel, tax, shipping, a manual payment method, and a location or channel per vendor. Like `infra/ct-setup` today |
| Event intake | How orders and shipments come back: a queue for commercetools, webhooks for Shopify or BigCommerce. Each connector turns these into `OrderEvent`s, deduplicated through `processedEvents` |
| A "Connecting <platform>" guide | Credentials and scopes, the setup steps, mapping vendors, and what the platform can't do (its `capabilities`) |

The interface is versioned like the API: changes within a version only
add. A connector built for version 1 keeps working.

Taking the product to a new platform follows the same steps each time:
1. A short spike: can that platform record a paid order with no shopper
   payment, and can it keep stock per vendor?
2. Build the adapter until it passes the conformance suite.
3. Write the setup tooling and the guide.

The effort depends on the platform and is estimated in its spike.

What we expect to find on the platforms named so far, all to be
confirmed in their spikes:

| Need | commercetools | Shopify | BigCommerce |
| --- | --- | --- | --- |
| Stock per vendor | Supply Channels | Locations | Inventory locations |
| Order paid by company balance | Payment with a successful Charge | Admin API order marked paid, with a manual transaction | Order created by the API with an offline or manual payment |
| Companies and teams | Not used (ours, see 2) | B2B only on some plans, which is why companies are ours | B2B Edition only, so the same reason |
| Order events | Subscription to a queue | Webhooks | Webhooks |

### 6. Customer accounts (added 29 Oct 2026)

Accounts are the first part of the contract, because they are the only
commerce code built so far:

- **The connector does only what needs the platform.** Create a customer,
  find one by email or id, record a verified email, and check a password or
  run the platform's own sign-in page.
- **The product owns the rest, the same on every platform:**
  - its own sessions (15-minute access tokens, 7-day sessions);
  - verification links;
  - rate limits;
  - every email.

  A platform with its own customer session (commercetools' OAuth tokens)
  keeps it sealed inside ours, as an opaque `platformSession`.
- **Sign-in mode is a capability.** `password` uses our forms. `hosted`
  sends the person to the platform's own page and back to `/auth/callback`;
  that covers platforms that sign in with an email code, such as Shopify's
  customer accounts. The app asks `GET /v1/auth/options` which one applies.
- **Choosing a connector is configuration.** `COMMERCE_CONNECTOR` names it,
  the API loads `@gifting/commerce-<name>`, and the list of installed
  connectors is generated from the API's `package.json`.
- **A lint rule holds the line.** Outside connector packages and `infra/`,
  nothing imports `@gifting/ct`, a commercetools SDK or a connector.

### 5. Neutral references in our records

`gifts.ctOrderNumber` becomes
`commerceOrder: { connection, orderNumber, orderRef }`. Items are referred to
by `{ connection, sku }`. The ledger's idempotency keys don't change.

## What changes if this is accepted

| Area | Change |
| --- | --- |
| [ADR 0001](0001-commerce-in-commercetools.md) | Partly replaced. "commercetools owns commerce" becomes "the commerce platform owns products, prices, stock, carts, orders, payments, tax and shipments". Companies, teams, members and vendors move to the platform. The single-source-of-truth rule stays: keys and references, never copies |
| [ADR 0005](0005-company-balance-payment.md) | Stays; the commercetools Payment becomes the commercetools adapter's way to record company-balance payment |
| [ADR 0006](0006-vendors-as-supply-channels.md) | Partly replaced. Vendors are platform records; supply Channels become how the commercetools adapter keeps stock per vendor |
| [Data model](../data-model.md) | Three new collections (`companies`, `members`, `vendors`; 8 become 11). `gifts.ctOrderNumber` becomes `commerceOrder`. Zod models and indexes follow, with member-lookup indexes starting with `companyKey` |
| [commercetools design](../commercetools.md) | Becomes the commercetools adapter's design. Business Units, Associate Roles and the `company-settings` and `team-settings` types are no longer needed |
| CLAUDE.md rules | "commercetools owns commerce" becomes "Commerce goes through adapters". Only `packages/commerce-*` and `infra/*` import a platform SDK |
| [POC plan](../../plans/poc-plan.md) | M0 gains a package: the commerce interface, the in-memory connector, the conformance suite and a commercetools connector skeleton (about 3 days). M1 1.1 builds companies and teams in MongoDB, not Business Units, and spike 4 is dropped. M2 2.2 and M4 4.2 and 4.3 call the connector. M6 6.3 reconciles through it. No second connector in the POC |
| Existing code | `@gifting/ct` becomes the commercetools adapter's internals. `infra/ct-setup`, `infra/seed` and `infra/catalog` stay commercetools tooling. The data already in the project stays useful |

## Consequences

- **Good:**
  - The product can be taken to a client on another platform by writing
    an adapter, not by changing gift, campaign or ledger code.
  - Testing gets easier: an in-memory commerce adapter (like the `log`
    channel) lets the redemption flow run in tests with no commercetools
    calls.
  - It matches how we already handle delivery channels.
- **Cost:**
  - About 2 to 3 extra days in M0 and M1: the interface, the adapter
    skeleton, and companies, teams and members in our database.
  - Some commercetools strengths become adapter internals rather than the
    product's model: Business Unit permissions and B2B approval flows. The
    accelerator shows commercetools a little less directly.
- **Risk: a lowest-common-denominator interface.** Mitigation: keep the
  interface to the operations above, and use `capabilities` for real
  differences (for example, a platform that can't calculate tax uses an
  external tax service, as spike 3 already plans for production).
- **Risk: payment by company balance must exist on each platform.** Each new
  adapter starts with a spike on placing a paid, idempotent order with no
  shopper payment.
- **More to run:** every connection needs its own event intake (Subscription
  and queue, or webhooks) and its own reconciliation.

## Alternatives considered

- **Stay commercetools-only for the POC; abstract later.**
  - Simplest, and it shows commercetools best.
  - But companies, vendors and order references would be built on
    commercetools concepts in M1 and M4, and then rebuilt.
- **A GraphQL federation gateway or BFF over the platforms.**
  - It unifies how data is fetched, not what it means.
  - Each platform's orders, payments and stock still differ, so the
    adapter logic is needed anyway.
- **A third-party unified commerce layer** (a storefront data-layer
  product).
  - These target shopper storefronts: browse, cart, checkout.
  - They don't cover placing orders paid from our own ledger, stock per
    vendor, or order events for routing.
  - Another dependency for a small interface.

## Questions

Answered by Shivam on 28 Oct 2026:

- **Platforms:**
  - commercetools only in the POC;
  - Shopify and BigCommerce are the first likely others, each built when a
    client needs it.
- **Connections:** one platform per deployment, the client's own. The data
  model doesn't rule out more later.
- **Second connector:** not in the POC.

Still open:

- Which platform comes first after the POC? That depends on the first
  client, and its connector starts with the spike in section 4.
