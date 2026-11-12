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
| Link secret leaks in a log, referrer or cache | The request log records the route pattern, not the URL; the recipient app sends no referrer, is never cached or indexed, and cannot be framed; a resend or reissue replaces the link and the old one stops working |
| Someone hammers links or the choose step | Per-address limits (60 opens, 10 choices a minute) |
| Gift email carries injected markup or a bad link | Every user text is HTML-escaped; only http(s) links are used |
| A company sees another company's data | The session's company and team come from the person's memberships in the commerce platform, never the request; every call is scoped to them; outside scope is "not found" |
| A member does something their role doesn't allow | Every dashboard route declares an action; the API checks the person's roles on that team first (`403 forbidden`) |
| A vendor sees other vendors' orders, or recipient details it doesn't need | Vendor queries filter on the vendor's channel; only shipping fields returned |
| Sender approves their own large campaign | Above each team's threshold an approver must approve: someone with `campaign:approve` on the team, never the campaign's sender |
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
- **Sessions are the API's own** (ADR 0013 section 6), the same on every
  commerce platform:
  - encrypted tokens (A256GCM with `API_SESSION_SECRET`), each with a kind,
    so a refresh token or a link can't stand in for an access token;
  - access tokens last 15 minutes, a session at most 7 days;
  - sign-out stops the session at once and ends the platform's own session
    (commercetools' tokens are revoked);
  - the list of ended sessions is kept in memory (one API instance in the
    POC) and moves to MongoDB before there's more than one.
- **The API checks every signed-in call** by opening its own token, then
  reads the customer from the platform at most once a minute per session.
  The person comes from the token, never from the request.
- **A platform's own sign-in page** (hosted mode): the API issues a state
  that expires in 10 minutes, the app keeps it in a cookie and checks it on
  return, and each code works once.
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

## Organizations, roles and what they can do

[ADR 0016](decisions/0016-organizations-and-roles.md),
[plan](../plans/organizations-and-roles.md):

- **Who belongs where comes from the commerce platform.** On commercetools a
  company is a Company Business Unit, a team is a Division under it, and a
  member is an associate with a role. The API reads them through the
  connector's `organizations`, never from the request.
- **Owners and admins** hold their role on the company, and it applies on
  every team. **Approvers and senders** hold theirs on one team.
- **What a role may do is ours:** the map in
  `packages/domain/src/permissions.ts`. Every dashboard route declares the
  action it needs, and the API refuses it before the handler runs. The apps
  hide what a person can't use, but the API is what enforces it.
- **Refusals:** no membership is `403 no_membership`; another company's or
  team's data is `404`; an action the role doesn't grant is `403 forbidden`.

| Action | Owner | Admin | Approver | Sender | Vendor | Ops |
| --- | --- | --- | --- | --- | --- | --- |
| See the Home overview, the team balance, the catalog and campaigns (`reports:view`, `budget:view`, `catalog:view`, `campaign:view`) | ✓ | ✓ | ✓ | ✓ | | |
| Create and send campaigns (`campaign:create`) | ✓ | ✓ | | ✓ | | |
| Approve or decline campaigns, never their own (`campaign:approve`) | ✓ | | ✓ | | | |
| Send a gift again, cancel a gift (`gift:manage`) | ✓ | ✓ | | ✓ | | |
| Build collections (`collection:manage`) | ✓ | ✓ | | ✓ | | ✓ (platform) |
| Search the directory, add recipients while sending (`recipients:view`, `recipients:add`) | ✓ | ✓ | | ✓ | | |
| Edit the recipient directory (`recipients:manage`) | ✓ | ✓ | | | | |
| Top up, see statements (`budget:topup`, `statement:view`) | ✓ | ✓ | | | | ✓ |
| Manage members and integrations (`members:manage`, `integrations:manage`) | ✓ | ✓ | | | | ✓ |
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
