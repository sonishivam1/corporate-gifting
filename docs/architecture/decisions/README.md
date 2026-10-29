# Architecture decision records

One file per significant decision: the context, what we chose, and what it
costs. Status is **Proposed** (needs agreement), **Accepted**, or
**Superseded by NNNN**.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-commerce-in-commercetools.md) | commercetools owns commerce; the platform owns entitlements and money | Accepted |
| [0002](0002-mongodb-for-platform-data.md) | MongoDB Atlas for platform data only | Accepted |
| [0003](0003-monorepo-zod-models.md) | pnpm and Turborepo monorepo with Zod-first models | Accepted |
| [0004](0004-modular-monolith.md) | A modular monolith: one Fastify API and one worker service | Accepted |
| [0005](0005-company-balance-payment.md) | Redemption orders carry real totals, paid by a company-balance Payment | Accepted (supersedes the v1 100% discount) |
| [0006](0006-vendors-as-supply-channels.md) | Vendors as commercetools supply Channels; the platform routes orders | Accepted |
| [0007](0007-append-only-ledger.md) | An append-only ledger with deterministic idempotency keys | Accepted |
| [0008](0008-channel-adapters.md) | Delivery channels and providers behind adapters | Accepted |
| [0009](0009-identity-provider.md) | A hosted identity provider (Auth0 or Google Cloud Identity Platform) | Proposed |
| [0010](0010-api-versioning.md) | The Gifting API is versioned under `/v1` | Accepted |
| [0011](0011-jobs-on-mongodb.md) | Background jobs on MongoDB (Agenda) for the POC | Proposed |
| [0012](0012-shadcn-ui.md) | shadcn/ui as the one component library, in `@gifting/ui` | Accepted |
| [0014](0014-google-cloud.md) | The cloud environment runs on Google Cloud | Accepted |

To add one, copy the shape of an existing record, take the next number, and
link it here.
