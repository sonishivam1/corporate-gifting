# 0001 — commercetools owns commerce; the platform owns entitlements and money

**Status:** Accepted (27 Oct 2026)

## Context

Gifting needs a catalog, prices, stock, carts, tax, orders and shipments, all
things commercetools does well. It also needs things commercetools has no
model for: team budgets, holds and true-ups, campaigns, gift links, approvals
and milestone automation. This is a practice accelerator, so it should show
commercetools at its best rather than rebuild it.

## Decision

Everything commercial stays in commercetools: products, prices, stock,
carts, orders, payments, tax, shipments, companies and teams (Business Units)
and vendors (supply Channels). The Gifting platform owns only entitlements and
money: budget accounts, the ledger, collections, recipients, campaigns,
gifts, integrations. Platform records hold commercetools keys, never copies.

## Consequences

- One source of truth per fact; no sync jobs between our database and
  commercetools.
- Reads that join gifting data with commerce data (a gift's order status) make
  a commercetools call. `shipped` and `delivered` are the one exception,
  mirrored onto the gift so dashboards stay fast.
- The redemption path spans two systems with no shared transaction, so it
  relies on idempotency and a stuck-claim reconciler (see
  [key flows](../flows.md#redemption)).
- Taking the accelerator to a client who already runs commercetools means
  adding a store and channels, not migrating a catalog.
