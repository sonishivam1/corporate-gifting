# 0008 — Delivery channels and providers behind adapters

**Status:** Accepted (27 Oct 2026)

## Context

The POC needs six delivery channels (email, SMS, Slack, Teams, links, QR),
each with its own provider, approval process and failure modes. HR systems,
payment providers and vendors vary by client too. Campaign and gift code
that knows about Twilio or Slack would have to change every time a client
uses a different provider.

## Decision

Each delivery channel implements the `Channel` interface in
`@gifting/channels` (`send`, `remind`, optional status webhook parsing), and
is registered by kind. Campaigns and gifts call the registry and never
import a provider SDK. The same pattern applies to the HR connector, the
payment provider and vendor notifications. Secrets for each are resolved by
reference at call time.

## Consequences

- A campaign can mix channels per recipient; adding a channel is a new
  adapter plus registration.
- A development `log` adapter (and Mailpit for email) lets the whole flow run
  locally with no provider accounts.
- Provider-specific features (Slack buttons, Teams adaptive cards) live
  inside adapters; the shared `GiftMessage` stays small.
