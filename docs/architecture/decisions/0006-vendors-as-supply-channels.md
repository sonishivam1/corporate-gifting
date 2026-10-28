# 0006 — Vendors as commercetools supply Channels; the platform routes orders

**Status:** Accepted (27 Oct 2026)

## Context

commercetools has no built-in marketplace or vendor entity. We need each
brand's stock kept apart, each order sent to the brand that owns the item,
and vendors limited to their own orders. Options were a project per vendor
(too heavy), a Store per vendor (stores are about selling, not supplying), or
supply Channels.

## Decision

One supply Channel (role `InventorySupply`) per vendor, with a `vendor`
custom type for contacts, fulfilment method and SLA. Every variant carries a
`vendorKey` attribute, and stock is kept per vendor channel. The redemption
cart line uses the vendor's supply channel. The Fulfillment module routes
`OrderCreated` to the vendor that owns the line item's channel, and the
vendor portal-lite shows each vendor only its own orders.

## Consequences

- Stock, availability and reservations work per vendor with standard
  commercetools features.
- Routing, vendor notifications and the vendor portal are ours to build.
- One line per redemption order keeps routing trivial; multi-item gifts
  would need order splitting (not in the POC).
- Vendor payouts are outside the POC; the real order totals (ADR 0005) make
  them possible later.
