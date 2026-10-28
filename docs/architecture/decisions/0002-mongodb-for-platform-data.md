# 0002 — MongoDB Atlas for platform data only

**Status:** Accepted (27 Oct 2026)

## Context

The platform's own data is small and document-shaped. A gift carries an
embedded claim and a list of notifications, a campaign carries its rules and
branding, and a collection carries its rule set. The two correctness guarantees
we need are an atomic single-document claim and an atomic gift-plus-ledger
write. The team already runs MongoDB Atlas on other accelerators (ambient-crm).
Postgres was considered in v1.

## Decision

Use MongoDB Atlas with the official Node.js driver and Zod schemas, for
eight collections only: `accounts`, `ledgerEntries`, `collections`,
`recipients`, `campaigns`, `gifts`, `integrations`, `processedEvents`.
Anything commercetools models stays there (ADR 0001). Locally,
`mongodb-atlas-local` in Docker gives a replica set, so transactions work.

## Consequences

- Claims are one `findOneAndUpdate` with the lock in the filter; no row locks
  or isolation levels to reason about.
- Gift plus ledger writes use multi-document transactions, which need a
  replica set everywhere, including local and CI.
- No foreign keys: integrity is the application's job, enforced by unique
  indexes and by writes going through module services.
- The ledger is a collection, not a ledger database. Append-only is
  enforced by database user permissions in production and by code review.
- A new collection needs a decision record.
