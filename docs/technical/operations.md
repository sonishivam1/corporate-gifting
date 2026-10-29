# Operations

**Status:** planned. The jobs and checks below arrive with M4 to M6; this
page is the runbook they will follow.

## What runs on a schedule

| Job | Schedule | Alert when |
| --- | --- | --- |
| `campaign-send` | At each campaign's send time | A gift fails to send 3 times |
| `milestone-automation` | Daily 06:00 company time | It hasn't completed by 07:00 |
| `reminders` | Hourly | Provider error rate above 5% |
| `expiry` | Hourly | — |
| `stuck-claim-reconciler` | Every 5 minutes | A gift stays `redeeming` for more than 15 minutes |
| `ledger-reconciliation` | Hourly | Any mismatch |
| `statements` | 1st of the month | A statement fails |
| `ct-events` | Continuous | Dead-letter topic not empty (Cloud Monitoring alert) |
| `hr-sync` | Nightly | A sync fails twice in a row |

## Reconciliation

The hourly check compares:
1. **Open holds against live gifts:** for every gift in `scheduled`, `sent`,
   `opened` or `redeeming` (`HOLDING_STATUSES` in `@gifting/domain`), exactly
   one open hold equal to `holdCents`; for every other status, no open hold.
2. **Captures against orders:** for every redeemed gift, the capture equals
   the commercetools order `totalPrice` of `GFT-<giftId>`.
3. **Payments against captures:** the order's company-balance Charge
   interaction id equals the capture's idempotency key.

A mismatch raises an alert. Nothing is auto-corrected; ops investigates and
writes an `adjustment` with a reason if money must move.

## Runbook

| Situation | Do |
| --- | --- |
| Gift stuck in `redeeming` | The reconciler handles it. If it alerts: look up `GFT-<giftId>` in commercetools. If the order exists, run the finish step; if not, roll the gift back to `opened`. Never create the order by hand. |
| Vendor can't ship | Cancel the order in the vendor portal (ops): refund entry, gift reopens with a fresh hold, recipient is told to choose again. |
| Recipient lost the link | Sender uses Resend; the token stays the same. If the link leaked, Cancel and create a new gift. |
| Balance looks wrong | Run the reconciliation report for the account; read the ledger entries; correct only with an `adjustment`. |
| Duplicate commercetools events | Expected; `processedEvents` drops them. If the DLQ fills, inspect and replay. |
| Secret leaked | Rotate it in the provider, add a new version in Secret Manager, redeploy the Cloud Run services that read it. Record it in the build log. |

## Logs

Structured JSON from `@gifting/logger` with `requestId`, `companyKey`,
`giftId` and `jobName` as fields. Logs never contain personal data, tokens
or secrets.
