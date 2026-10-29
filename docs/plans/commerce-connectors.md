# Commerce connectors from day one: accounts first

**Status:** Proposed (29 Oct 2026), waiting for agreement
**Agreed:** — · **Built:** —

## Goal

Make the commerce platform a plug-in from today, so that connecting a client
on Shopify, BigCommerce or another platform means **adding a connector
package and setting configuration, with no change to the product's code**:
no change to the API modules, the apps, `@gifting/domain` or the ledger.

Shivam asked for this on 29 Oct 2026. [ADR 0013](../architecture/decisions/0013-commerce-adapters.md)
(proposed on `docs/commerce-adapter-adr`) already sets out connectors for
catalog, orders, payment and events. It was written before the product
became B2C ([ADR 0015](../architecture/decisions/0015-commerce-customer-accounts.md)),
so it doesn't cover customer accounts. Accounts are the only commerce code
that exists today, so they go first. Every later commerce feature is built
through the connector from its first line.

**What "no code changes" means:** a platform still needs its connector
written once, as its own package. After that, every client on that platform
is configuration only. The product never changes to take on a platform.

## Scope

| Piece | What it is |
| --- | --- |
| `@gifting/commerce` (new package) | The contract, versioned like the API (v1; changes only add). `CommerceConnector { id, contractVersion, capabilities, accounts }`, the neutral `Customer` and `CustomerRef { connection, id }` types, and the shared **conformance test suite** every connector must pass. Catalog, orders, payment and events are added to the same contract when M2 and M4 build them (ADR 0013) |
| `@gifting/commerce-commercetools` (new package) | Today's `ct-identity.ts`, moved out of the API. The only package (besides `infra/*`) that imports `@gifting/ct` |
| `@gifting/commerce-memory` (new package) | An in-memory connector that passes the same suite. API tests use it, and it can pretend to be a platform with different capabilities (for example email-code sign-in) |
| Connector loading | The API reads `COMMERCE_CONNECTOR` (for example `commercetools`) and loads `@gifting/commerce-<name>` by package name, then that connector reads its own settings. Adding a platform is adding its package to the deployment and setting the variable |
| Our own sessions | The API issues its own access and refresh tokens (encrypted with `API_SESSION_SECRET`), holding `{ connection, customerId }`. A platform that has its own customer tokens (commercetools' OAuth password flow) keeps them sealed inside our session, so commercetools' OAuth stays in use. A platform without tokens (BigCommerce) just checks the password |
| Our own verification links | A signed, 60-minute, single-purpose token made by the API. The connector only records "email verified" on the customer, which every platform can do (a commercetools field, a Shopify metafield, a BigCommerce attribute) |
| Capabilities drive the UI | `GET /v1/auth/options` (public) says how this deployment signs people in: `password` today, `email-code` for platforms like Shopify's new customer accounts. The sender app shows the matching form |
| A lint guard | ESLint stops API modules, the worker and the apps from importing `@gifting/ct` or any `@gifting/commerce-*` connector. Only the loader may |

**Not in scope:**
- a Shopify or BigCommerce connector (each starts with a spike when a client
  needs it);
- the catalog, order, payment and event parts of the contract (they come
  with M2 and M4);
- the B2C clean-up of Business Units and `member:add`.

## Decisions

1. **The connector contract holds no platform concepts.** No tokens, stores,
   Business Units or SDK types cross it. Real differences are
   `capabilities`, which the product checks instead of a platform's name.
2. **The product owns the session, the verification link, the rate limits
   and the emails.** Every platform behaves the same to the person signing
   in, and a platform that can't do something (BigCommerce has no email
   verification) doesn't need to.
3. **Per-request checks happen in the API**, by opening our own token. This
   drops the commercetools introspection call on every request. Sign-out
   adds the session to a revoked list kept in memory, like the rate limits,
   which moves to MongoDB before there's more than one API instance. Access
   tokens last 15 minutes and the session 7 days, as today.
4. **References name their connection.** Sessions, and later records in
   MongoDB, hold `{ connection, id }`, never a bare platform id.
5. **The conformance suite is the definition of plug and play.** It covers:
   - register, then a duplicate email;
   - find by email, get by id;
   - mark verified;
   - a right and a wrong password;
   - a customer without a password;
   - and, when the platform has them, sealing, refreshing and ending its
     own session.

   The memory connector runs it in every `pnpm test`. The commercetools
   connector runs it against the sandbox with `pnpm test:conformance`, which
   needs `.env` and is never part of CI.
6. **ADR 0013 is accepted**, extended with a section on customer accounts.
   The B2C change also makes its "companies, teams and members in MongoDB"
   section future work.

## Tests

- The conformance suite passing for `commerce-memory` (CI) and
  `commerce-commercetools` (sandbox).
- Every existing accounts test (22) passing against the memory connector,
  with nothing about commercetools left in them.
- What must be refused, as today: an unverified sign-in, a wrong password,
  a taken email, a passwordless record, too many attempts. New:
  - a token from another deployment's secret;
  - a token after sign-out;
  - a verification link used for something else, or expired.
- The memory connector set to `email-code`: `/v1/auth/options` reports it,
  and password sign-in is refused.
- The lint guard failing when an API module imports `@gifting/ct` (break it,
  watch it fail, restore it).
- By hand, against the real project: register, verify (real email through
  Brevo), sign in, refresh, sign out.

## Docs to update

- ADR 0013 (accepted, with the accounts section) and ADR 0015 (sessions and
  verification links become ours; commercetools OAuth sits inside the
  connector).
- CLAUDE.md: "commercetools owns commerce" becomes "commerce goes through
  connectors", and the import rule.
- [Architecture overview](../architecture/overview.md),
  [security](../architecture/security.md), [API](../technical/api.md),
  [configuration](../technical/configuration.md) (`COMMERCE_CONNECTOR`,
  `API_SESSION_SECRET`), the workspace tree, a "Writing a connector" guide,
  the build log, and the roadmap.

## As built

Not started.
