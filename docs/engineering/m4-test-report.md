# M4 test report: gift delivery and redemption

Branch `feat/gift-delivery-and-redemption`, on top of `develop` at `f737903`
(PR #4, sign-in and commerce connectors). Run on 29 Oct 2026.

## Automated checks

| Check | Result |
| --- | --- |
| `pnpm lint` | 20 of 20 packages pass |
| `pnpm typecheck` | 20 of 20 pass |
| `pnpm test` (unit) | 15 of 15 pass |
| `pnpm --filter @gifting/api test:integration` | 51 tests pass (29 from the team, 22 new in `redemption.test.ts`) |
| `pnpm build` | 6 of 6 pass |

## What the integration tests prove

- Sending a campaign emails each recipient their own link; the database holds only the link's hash.
- A failed email leaves the gift retryable; the sender resends with a new link.
- Opening a link marks the gift opened; no price is ever shown; an unknown or malformed link learns nothing.
- Choosing a gift makes one order `GFT-<giftId>`, redeems the gift, and in one transaction releases the hold and captures what the order cost.
- 20 parallel choices make exactly one order and one capture. A second try of the same link is refused.
- A sold-out item frees the claim so the recipient can choose again; nothing is captured.
- An order above its hold is never refused: the capture is capped at the hold and the overage is debited to the team on the same gift.
- A configured estimate is held at send, shown in the estimate, and the unused part is released at redemption.
- A timeout after the order was created finds the order and finishes without a second one.
- Order creation switched off gives a plain error and frees the claim.
- An expired link is refused. Cancel releases the hold and kills the link; resend replaces the link.
- A gift already chosen, or one in another team, cannot be resent or cancelled.
- Repeated guessing is stopped with 429.

## Browser run (local, real commercetools sandbox)

Two API processes shared one MongoDB: the memory connector (sender sign-in) and
the commercetools connector (orders).

| Step | Result |
| --- | --- |
| Register a test account, verify by email (Mailpit), sign in | Works |
| Sender dashboard, new-campaign wizard, campaigns list | Shown; the funnel and spend update from our data |
| Campaign sent to 3 recipients | 3 emails in Mailpit with private links |
| Open a link (desktop and phone width) | Greeting card, then the gifts to choose from, no prices |
| Open a gift, choose it | Gift page, then the address form |
| Submit the empty form | Field errors shown, nothing sent |
| Submit a valid Texas address | Real commercetools order, "It's on its way" with the order number |
| Reuse the same link | "This gift has already been chosen" |
| Cancel a gift | Its link shows "This gift has expired", hold released |
| Resend a gift | New email; the old link answers invalid |
| Security headers on the recipient app | CSP, no referrer, no framing, no caching |

## Changes made while merging the latest `develop`

- Order creation moved from `@gifting/ct` into the connector contract (`orders` on `CommerceConnector`) and the commercetools connector, so the API no longer imports `@gifting/ct`.
- Recipient routes are `auth: "public"`; resend and cancel are `auth: "workspace"`.
- `nodemailer` aligned to the version `develop` uses.

## Known limits and open points

- A gift's hold is the budget plus an estimate for shipping and tax (`GIFT_ESTIMATE_PERCENT`, shown to the sender). The right percentage is a business decision. An order above its hold is never refused: the overage is debited to the team on the ledger.
- A resend replaces the link, because only hashes are stored.
- Campaigns with a future send date are not delivered by anything yet: the team's worker must call the delivery service when it builds scheduling.
- The sender wizard was shown but not driven end to end in the browser; the campaign was sent through the same API the wizard calls.
- Order status after the order (shipped, delivered) waits for vendor routing.
- Leftover test orders exist in the commercetools sandbox.
