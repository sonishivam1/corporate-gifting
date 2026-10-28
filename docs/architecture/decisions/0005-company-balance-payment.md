# 0005 — Redemption orders carry real totals, paid by a company-balance Payment

**Status:** Accepted (27 Oct 2026). Supersedes v1's 100% direct discount.

## Context

In v1 (one merchant, "choose your tin") the redemption order was zeroed with
a 100% direct discount on the cart. That works for a single merchant who
already knows the gift was prepaid. In a marketplace it breaks three things:

- vendors need the real value of what they ship (for payouts and returns);
- tax must be calculated on the real price at the recipient's address;
- reporting and reconciliation need real order totals to match the ledger.

## Decision

The redemption cart keeps its real prices, shipping and tax. Before the order
is created, the API adds a commercetools Payment with method
`company-balance`, amount equal to the cart total, and one successful
`Charge` transaction whose interaction id is the ledger capture key. The
money itself moves in our ledger, in the same transaction that marks the
gift redeemed. The recipient never sees a payment step.

## Consequences

- Orders, tax and payments in commercetools are true values; the ledger's
  captures reconcile to order totals to the cent.
- The API must check the total fits the gift's hold before creating the
  order, refusing the item or charging the overage to the team where allowed.
- Spike 1 must prove the Payment and order creation work with no customer
  payment step, before M4 depends on it.
- Payment method `company-balance` is a convention, not a PSP integration;
  live payment providers are only used for top-ups.
