# 0007 — An append-only ledger with deterministic idempotency keys

**Status:** Accepted (27 Oct 2026)

## Context

Money moves at many points (top-up, send, redemption, expiry, vendor
cancellation, ops correction), triggered by jobs, webhooks and users. All of
these can retry. A stored balance field updated in place would drift the
first time a retry or a race slipped through, and nobody could explain the
drift afterwards.

## Decision

Money is a list of immutable entries in `ledgerEntries`: `top-up`, `hold`,
`release`, `capture`, `fee`, `refund`, `adjustment`. Amounts are positive
integer cents; the type gives the direction. Each entry's idempotency key is
derived from what it is for (`capture:<giftId>:<holdNo>`), with a unique
index. Balances are always computed by one function, `computeBalance()` in
`@gifting/ledger`. Gift status changes and their entries commit in one
transaction.

## Consequences

- A retried job writes nothing new; a duplicate key is treated as success.
- Every balance can be explained line by line, and statements fall out of
  the entries.
- Computing balances by summing grows with history; if it gets slow, add
  monthly closing snapshots (still derived, never edited).
- Corrections are visible `adjustment` entries with a reason, never edits.
