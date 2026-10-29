# Security, integrity and money safety

The two things that must never go wrong are a gift producing two orders and
money moving twice. Both are blocked in the database, not only in code.

**Status:** planned with each milestone; M7 runs a full security pass.

## Threats and controls

| Threat | Control |
| --- | --- |
| A gift redeemed twice (double click, retry, two tabs) | Atomic lock on the gift before any commercetools call; unique order number `GFT-<giftId>` |
| Money moved twice (job retry, webhook replay) | Deterministic idempotency keys with a unique index; append-only ledger |
| Recipient picks something over budget, or tampers with price | The server re-reads SKU, price, stock and country; prices never come from the browser; total must fit the hold |
| Gift link guessed or leaked | 32 random bytes, stored only as SHA-256; links expire; short codes rate-limited with lockout; `/r/*` behind bot protection |
| A company sees another company's data | Every call scoped to the session's company and team; outside scope is "not found" |
| A vendor sees other vendors' orders, or recipient details it doesn't need | Vendor queries filter on the vendor's channel; only shipping fields returned |
| Sender approves their own large campaign | Approver must differ from the sender, above each team's threshold |
| Unfunded sends | Holds placed before any send; a short balance fails the whole campaign |
| Duplicate or replayed commercetools events | `processedEvents` with the message id, TTL 30 days |
| Stolen commercetools or provider credentials | Server-only, scoped per client, in a secrets manager; never in a browser, log or repo |
| Ledger tampering | Insert and find only for the production ledger user; corrections only as `adjustment` with a reason |

## Register and sign in

[ADR 0015](decisions/0015-commerce-customer-accounts.md):

- **Accounts are commercetools customers** in the `gifting` store, signed in
  with commercetools' OAuth 2.0 password flow.
  - Anyone may register (B2C), and must verify their email from a link
    (valid an hour) before they can sign in.
  - commercetools would sign in unverified accounts, so the API refuses
    them and revokes the tokens.
- **Customer tokens come from a dedicated API client with only
  `manage_my_profile`.**
  - The API refuses to start if that client holds admin scopes. With the
    admin client, every customer token would carry full project access.
- **The API checks every signed-in call.** It introspects the token (active,
  and which customer), caching the result for 60 seconds. The person comes
  from the token, never from the request.
- **What answers reveal:**
  - Register says when an email is taken (`409`, a product decision on 29
    Oct 2026). That lets someone check whether an email has an account.
  - Sign-in and resend never reveal one: a wrong email or password gives one
    generic message.
- **Passwords:**
  - 10 to 128 characters, with an uppercase letter, a lowercase letter, a
    number and a special character;
  - never containing the email name;
  - checked in the app and again in the API (`@gifting/domain`);
  - stored only by commercetools.
- **Rate limits:** 5 failed sign-ins per email in 15 minutes, and 3 account
  emails per address an hour. They're held in memory (one API instance in
  the POC).
- **The browser never holds a token.**
  - The sender app keeps the access and refresh tokens in one encrypted
    (A256GCM), http-only, `SameSite=Lax` cookie, which lasts at most 7 days.
  - It renews the access token in `proxy.ts`.
  - Sign-out is a form post (a server action), and revokes both tokens.
- **Logs never include emails, passwords, tokens or links.** They log
  customer ids.

## Roles and what they can do

| Action | Owner | Admin | Sender | Approver | Vendor | Ops |
| --- | --- | --- | --- | --- | --- | --- |
| Manage teams and members | ✓ | ✓ | | | | ✓ |
| Top up, see statements | ✓ | ✓ | | | | ✓ |
| Build collections | ✓ | ✓ | ✓ | | | ✓ (platform) |
| Create campaigns | ✓ | ✓ | ✓ | | | |
| Approve campaigns (not their own) | ✓ | | | ✓ | | |
| Manage recipients and integrations | ✓ | ✓ | | | | |
| See own orders, mark shipped | | | | | ✓ | |
| Companies, vendors, refunds, adjustments | | | | | | ✓ |

## Personal data

- Recipient names, emails, phones and birthdays are encrypted at rest
  (MongoDB client-side field-level encryption or Queryable Encryption,
  decided in M5). `emailLower` is kept for matching as a deterministic
  encrypted field.
- Home addresses live only on commercetools orders, never in MongoDB, and the
  sender never sees them.
- HR-system data is limited to the fields gifting needs.
- A retention job purges recipient data after the company's configured
  period.
- Logs never contain personal data, tokens or codes (see
  [conventions](../engineering/conventions.md#logging)).

## Secrets

- Locally in gitignored `.env` files; in the cloud in Google Secret Manager, each
  Cloud Run service reading only its own secrets.
- `integrations` stores only a reference.
- Rotate any secret that appears in git, logs, screenshots or chat.
