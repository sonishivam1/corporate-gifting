# Channels and integrations

Every delivery channel implements one interface, so a campaign can mix
channels per recipient, and a new channel plugs in without touching campaigns
or gifts ([ADR 0008](decisions/0008-channel-adapters.md)).

**Status:** the `Channel` interface, the registry and a development `log`
adapter are scaffolded in
[`packages/channels`](../../packages/channels/src/). Providers arrive in M3
(email, links, QR) and M5 (SMS, Slack, Teams).

## The channel interface

```ts
interface Channel {
  readonly kind: ChannelKind; // "email" | "sms" | "slack" | "teams" | "link" | "qr"
  send(message: GiftMessage): Promise<SendResult>;
  remind(message: GiftMessage, reminderNo: number): Promise<SendResult>;
  parseStatusWebhook?(body: unknown): StatusUpdate[];
}
```

`GiftMessage` carries the gift id, the recipient's address for that channel,
the link, the greeting and the company branding. It never carries the
token on its own, only inside the link. `SendResult` carries the provider's
message id and is stored on the gift's `notifications`.

## Delivery channels

| Channel | POC provider | Notes | Milestone |
| --- | --- | --- | --- |
| Email | SendGrid; Mailpit locally | Branded template per company; SPF, DKIM and DMARC on the sending domain; bounce webhooks | M3 |
| Links | Generated CSV | For senders who hand out links themselves; no reminders | M3 |
| QR codes | Generated PNG and SVG per gift link | For printed cards and events; no reminders | M3 |
| SMS | Twilio | Short fixed template with the link. US sending needs A2P 10DLC registration, which takes weeks: start in week 1 | M5 |
| Slack | Slack app, installed per company with OAuth | Bot direct message with an "Open gift" button; recipients matched by email | M5 |
| Microsoft Teams | Teams bot via Azure Bot Service | Proactive message with an adaptive card; the company's tenant admin must approve the app | M5 |

**Reminders:** email, SMS, Slack and Teams, on a per-company cadence (for
example day 3, day 7, then 7 days and 1 day before expiry), stopping at
redemption.

## Integrations

| Integration | POC approach | Later |
| --- | --- | --- |
| HR systems (birthdays, anniversaries, start dates) | CSV upload, plus one HR system through a unified HR API (for example Merge or Finch) with a nightly sync | More systems through the same adapter |
| Payments | Stripe test mode: card and ACH top-ups, invoices for invoice-billed accounts | Live mode, purchase orders, multi-currency |
| Identity | Hosted identity provider (Auth0 or Google Cloud Identity Platform, [ADR 0009](decisions/0009-identity-provider.md)) with email and password or magic link | SSO with SAML or OIDC per company |
| Vendors | Vendor portal-lite plus email notification | Vendor API, EDI or 3PL connectors |
| Tracking | Vendor enters carrier and tracking number | Tracking aggregator for automatic delivered status |

## Secrets

Slack and Teams install tokens, HR API keys and Stripe keys live in a secrets
manager (Google Secret Manager in the POC cloud; `.env` locally).
`integrations` stores only `secretRef`, `status` and `lastSyncAt`.

## External lead times

| Item | Typical lead time | Start |
| --- | --- | --- |
| A2P 10DLC brand and campaign registration (US SMS) | 1 to 4 weeks | Week 1 |
| Teams app approval in each demo tenant | Days to weeks, depends on the tenant admin | Week 1 |
| Slack app distribution | Same day for a test workspace | Week 1 |
| Email sending domain (SPF, DKIM, DMARC) | 1 to 2 days | Week 1 |
| HR API sandbox account | Days | Week 4 |
