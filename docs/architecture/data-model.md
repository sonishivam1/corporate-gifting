# Data model

All MongoDB shapes are Zod schemas in
[`packages/domain/src/models.ts`](../../packages/domain/src/models.ts);
TypeScript types are inferred from them. Indexes live in
[`packages/db/src/indexes.ts`](../../packages/db/src/indexes.ts).

**Status:** schemas and indexes scaffolded (M0); no module reads or writes
them yet.

## The rule

MongoDB holds only what commercetools can't
([ADR 0002](decisions/0002-mongodb-for-platform-data.md)). Companies, teams,
vendors, products, orders, addresses and shipments stay in commercetools;
MongoDB keeps their keys (`companyKey`, `teamKey`, `vendorKey`,
`ctOrderNumber`), never copies.

## Ownership classes

| Class | Collections | Rule |
| --- | --- | --- |
| **Money** | `accounts`, `ledgerEntries` | Accounts change rarely. Ledger entries are append-only: insert only, never update or delete. |
| **Gifting** | `collections`, `campaigns`, `gifts` | Owned by the platform. Gifts change only through the state machine, with a `version` counter. |
| **Personal** | `recipients` | Personal fields are encrypted at rest and purged after the company's retention period. |
| **Integration** | `integrations` | Connection status and a `secretRef`; never the secret itself. |
| **Plumbing** | `processedEvents` | One document per handled commercetools message; TTL 30 days. |

## Entities

```mermaid
erDiagram
  COMPANY ||--o{ TEAM : "has (ct Business Units)"
  TEAM ||--|| BUDGET_ACCOUNT : "spends from"
  BUDGET_ACCOUNT ||--o{ LEDGER_ENTRY : "is the sum of"
  COMPANY ||--o{ RECIPIENT : "directory"
  COMPANY ||--o{ COLLECTION : "owns (or platform)"
  TEAM ||--o{ CAMPAIGN : runs
  CAMPAIGN }o--|| COLLECTION : offers
  CAMPAIGN ||--o{ GIFT : creates
  RECIPIENT ||--o{ GIFT : receives
  GIFT ||--o{ LEDGER_ENTRY : "hold · release · capture · fee"
  GIFT |o--o| CT_ORDER : "GFT-giftId"
  CT_ORDER }o--|| VENDOR : "routed to (supply Channel)"
  COMPANY ||--o{ INTEGRATION : connects
```

`COMPANY`, `TEAM`, `VENDOR` and `CT_ORDER` live in commercetools.

## Collections

| Collection | Holds | Key indexes |
| --- | --- | --- |
| `accounts` | `companyKey`, `teamKey`, `currency`, `billingMethod` (prepaid or invoice), `creditLimitCents`, `stripeCustomerId`, `holdsUpdatedAt` (touched by every hold transaction so concurrent holds on one account conflict and retry) | unique `teamKey` |
| `ledgerEntries` | `accountId`, `type`, `amountCents`, `currency`, `giftId`, `campaignId`, `idempotencyKey`, `reason`, `createdAt`, `createdBy` | unique `idempotencyKey`; `{accountId, createdAt}`; `{giftId}` |
| `collections` | `owner` (`platform` or a `companyKey`), `name`, `rules` (tags, brands, SKUs, pinned), `countries`, `budgetBandCents`, `createdBy`, `updatedBy`, `archivedAt` (company collections; hidden from lists and new campaigns, still read by gifts already sent) | `{owner, name}` |
| `recipients` | `companyKey`, `teamKey`, `name`, `email`, `emailLower`, `phone`, `slackId`, `teamsId`, `birthdayMonthDay`, `startDate`, `startMonthDay`, `source` (`manual`: typed in the send flow; `csv`: an uploaded list; `hris`: M5), `externalId` | unique `{companyKey, emailLower}`; `{companyKey, birthdayMonthDay}`; `{companyKey, startMonthDay}` |
| `campaigns` | `companyKey`, `teamKey`, `type`, `status`, `collectionId` or `sku` (a variant SKU; its price is read live from commercetools when the campaign is estimated, submitted or approved), `budgetCents`, `channels`, `branding`, `greeting` (`occasion`, `cover`, `headline`, `fromName`), `message`, `recipientIds`, `reminders`, `expiresInDays`, `approval`, `trigger`, `sendAt`, `createdBy` | `{teamKey, status}`; `{type, status}` |
| `gifts` | `companyKey`, `teamKey`, `campaignId`, `recipientId`, `occurrence`, `budgetCents`, `holdCents`, `tokenHash`, `codeHash`, `status`, `statusAt` (when each status was reached; optional), `version`, `expiresAt`, `claim`, `notifications`, `ctOrderNumber` | unique `tokenHash`; unique `codeHash`; unique `{campaignId, recipientId, occurrence}`; `{status, expiresAt}`; `{teamKey, status}`; `{teamKey, statusAt.sent}` |
| `integrations` | `companyKey`, `type` (hris, slack, teams), `status`, `secretRef`, `lastSyncAt` | unique `{companyKey, type}` |
| `processedEvents` | `_id` = commercetools message id, `receivedAt` | TTL 30 days on `receivedAt` |

## Campaign statuses

A one-time or scheduled campaign is saved as `draft`, then submitted:

| Status | Means | Gifts |
| --- | --- | --- |
| `draft` | Saved, not submitted (or submit was refused, for example short of funds) | none |
| `pending_approval` | Over the team's threshold; waiting for an approver who isn't the sender | `pending_approval`, no holds |
| `approved` | Held and waiting for its send date; the app shows it as "Scheduled" | `scheduled`, held |
| `active` | Sent | `sent` onwards, held |
| `cancelled` | Declined by the approver | `cancelled` |

`sending` and `completed` are reserved for the send worker (M3.4) and
expiry (M6). The move out of `draft` or `pending_approval` is a
`findOneAndUpdate` with the expected status in the filter, in the same
transaction as the gifts and their holds, so a repeated submit or approval
changes nothing.

## Gift statuses

```mermaid
stateDiagram-v2
  [*] --> created
  created --> pending_approval : above threshold
  created --> scheduled
  created --> sent
  pending_approval --> scheduled : approved
  pending_approval --> sent : approved, send now
  pending_approval --> cancelled : rejected
  scheduled --> sent : send time
  sent --> opened : link opened
  sent --> redeeming : claim
  opened --> redeeming : claim
  redeeming --> redeemed : order created
  redeeming --> opened : out of stock or failed
  redeemed --> shipped : vendor ships
  shipped --> delivered
  redeemed --> opened : vendor cancels (refund, fresh hold)
  sent --> expired
  opened --> expired
  created --> cancelled
  scheduled --> cancelled
  sent --> cancelled
  opened --> cancelled
  delivered --> [*]
  expired --> [*]
  cancelled --> [*]
```

The allowed moves are `canTransition()` in
[`packages/domain/src/gift-status.ts`](../../packages/domain/src/gift-status.ts),
with unit tests. `shipped` and `delivered` are mirrored from the commercetools
order so dashboards don't need to call commercetools.

## Exactly-once rules

| Risk | Guard |
| --- | --- |
| Two orders for one gift | `findOneAndUpdate` from `sent`/`opened` to `redeeming` (the lock is in the filter), and the unique commercetools order number `GFT-<giftId>` |
| Money moved twice | Unique `idempotencyKey` on `ledgerEntries`, built by `ledgerKeys` (`hold:<giftId>:<holdNo>`, `capture:<giftId>:<holdNo>`, …) |
| Second birthday gift in a year | Unique `{campaignId, recipientId, occurrence}` on `gifts` |
| Gift and money disagree | Gift status and its ledger entries in one multi-document transaction |
| Duplicate commercetools event | Insert into `processedEvents` first; a duplicate key means skip |

## Money fields

All amounts are integer cents with an ISO currency (USD in the POC). There
are no floats anywhere money is stored or compared. See
[money and the ledger](money-and-ledger.md).
