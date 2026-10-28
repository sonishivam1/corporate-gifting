# Glossary

| Term | Meaning |
| --- | --- |
| **Company** | A customer organisation that sends gifts. A commercetools Business Unit of type Company. |
| **Team** | A part of a company with its own budget, approvers and threshold. A Business Unit of type Division under the company. |
| **Member** | A person at a company with a role: owner, admin, sender or approver. An identity-provider user plus a commercetools Associate. |
| **Recipient** | The person who receives a gift. Has no account; the gift link is the key. |
| **Vendor** | A brand or merchant that sells through the marketplace and ships its own orders. A commercetools supply Channel. |
| **Ops** | The platform operator: onboards companies and vendors, curates collections, makes money adjustments. |
| **Budget account** | A team's money account (`accounts`): prepaid or invoice-billed, with an optional credit limit. Its balance is computed from the ledger. |
| **Ledger** | The append-only list of money movements (`ledgerEntries`). Nothing is ever edited. |
| **Top-up** | Money added to a budget account (card, ACH or invoice payment). |
| **Hold** | Money set aside when a gift is created or a campaign approved: budget + shipping allowance + tax estimate + fee. |
| **Capture** | The real cost of a redeemed gift (item + shipping + tax), charged to the account. |
| **Release** | Returns a hold. On redemption the full hold is released and the capture charged instead; on expiry or cancellation the full hold is released. |
| **True-up** | Charging what the recipient actually chose instead of the full budget. The release-then-capture pair is the true-up. |
| **Fee** | The platform's charge per redeemed gift (model still open). |
| **Adjustment** | A correction entry written by ops, with a reason. |
| **Idempotency key** | A deterministic key per ledger entry or operation (for example `capture:<giftId>`), unique in the database, so a retry writes nothing new. |
| **Collection** | Rules that pick items a recipient may choose: tags, brands, SKUs, pinned items, budget band, countries. Platform-owned or company-owned. |
| **Budget band** | The collection's price ceiling ("anything up to $50"). |
| **Campaign** | One send: collection or SKU, budget per gift, recipients, channels, message, branding, expiry. One-time, scheduled or automated. |
| **Automated campaign** | Creates gifts on milestones (birthday, work anniversary, start date) from the recipient directory. |
| **Occurrence** | The date a milestone gift is for (for example 2026-11-03). One gift per campaign, recipient and occurrence. |
| **Gift** | One recipient's entitlement in a campaign. Has a status, a token, a hold and, once redeemed, an order. |
| **Gift token** | 32 random bytes in the gift link. Stored only as a SHA-256 hash. |
| **Short code** | A human-typable code for the gift (QR and printed cards). Stored as a hash, rate-limited. |
| **Claim** | The redemption attempt embedded in the gift: SKU, idempotency key, status, start time. |
| **Redemption** | Turning a gift into a commercetools order `GFT-<giftId>`, paid by the company balance. |
| **Company-balance payment** | A commercetools Payment with method `company-balance` and a successful Charge, referencing the ledger capture. |
| **Channel (delivery)** | How a gift reaches a recipient: email, SMS, Slack, Teams, link or QR. Not to be confused with a commercetools Channel. |
| **Supply Channel** | A commercetools Channel with the InventorySupply role; one per vendor, holding that vendor's stock. |
| **Vendor portal-lite** | The minimal vendor app: orders to fulfil, mark shipped, export. |
| **Reconciliation** | The hourly check that open holds match live gifts and captures match commercetools order totals. |
| **Processed event** | A commercetools message id already handled, stored in `processedEvents` for 30 days to drop duplicates. |
| **Spike** | A short, time-boxed experiment in week 1 that proves a risky part before the build depends on it. |
