# Open questions

Questions only the business can answer. Each one blocks or shapes a part of
the build. Record the answer, the date and who decided, then update the
affected docs.

| # | Question | Shapes | Needed by | Answer | Decided |
| --- | --- | --- | --- | --- | --- |
| 1 | Who operates the marketplace and contracts with vendors: our client or us? | Vendor onboarding, payouts, ops roles, branding | M4 (seed data is enough before) | — | — |
| 2 | Platform fee model: per gift, percentage, or subscription? | The `fee` entry and the hold formula | M3 | — | — |
| 3 | Who pays shipping and tax: built into the gift budget or charged on top? | Hold formula, collection price filter, recipient copy | M3 | — | — |
| 4 | Countries and currencies after the US? | Stores per country, prices, tax, multi-currency ledger | After the POC | — | — |
| 5 | Vendor payout terms and returns policy? | Vendor cancellation flow, refunds, statements | After the POC (M6 refund flow assumes full refund) | — | — |
| 6 | Which HR system to integrate first? | The HR adapter and sandbox account | M5 | — | — |
| 7 | Identity provider: Auth0 or Google Cloud Identity Platform? ([ADR 0009](../architecture/decisions/0009-identity-provider.md)) | Sign-in, member invites | M1 | Neither: commercetools customer accounts with its OAuth password flow. B2C, open registration with email verification ([ADR 0015](../architecture/decisions/0015-commerce-customer-accounts.md)). Auth0 was chosen on 28 Oct and replaced on 29 Oct | 29 Oct 2026, Shivam |
| 8 | Which commercetools project and region for the POC? | `CTP_*` settings, data residency | Week 1 | — | — |
| 9 | Which other commerce platforms must the product support, and in what order? ([ADR 0013](../architecture/decisions/0013-commerce-adapters.md)) | The commerce interface, connector priority | Before M1 | commercetools only in the POC. Shopify and BigCommerce are likely next, each built as a connector when a client needs it | 28 Oct 2026, Shivam |
| 10 | One commerce platform per deployment, or vendors on different platforms in one marketplace? | Commerce connections, vendor onboarding | Before M1 | One per deployment: the client's own platform. The data model leaves room for more | 28 Oct 2026, Shivam |
| 11 | Is a second commerce connector (for example a Shopify development store) in the POC scope? | POC plan, M7 demo | Before M1 | No | 28 Oct 2026, Shivam |

## Working assumptions until answered

- (1) We operate the POC marketplace; vendors are seeded and fictional.
- (2) A flat $3 fee per redeemed gift.
- (3) Shipping and tax are inside the budget: the collection filters items so
  item + shipping allowance + tax estimate fits.
- (4) US only, USD.
- (5) Vendor cancellation refunds the full capture.
- (6) CSV first; the HR API adapter targets whichever sandbox we get first.
