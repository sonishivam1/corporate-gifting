# 0015 — Register and sign in with the commerce platform's customer accounts

**Status:** Accepted (29 Oct 2026, Shivam). Replaces
[0009](0009-identity-provider.md) (Auth0).

## Context

On 29 Oct 2026 the product owner changed three things:
- **The product is B2C.** An account belongs to one person, not a company.
- **It is a corporate gifting platform for one merchant**, not a marketplace.
- **Anyone may register.** They give their details, verify their email from
  a link, and can then sign in.

The accounts should live in the commerce platform (commercetools today) and
use its OAuth 2.0. The product will later connect to other platforms
([ADR 0013](0013-commerce-adapters.md), proposed). Auth0 is dropped.

A probe of the commercetools project on 29 Oct 2026 showed:

| Behaviour | Result |
| --- | --- |
| Register a customer in the `gifting` store with a password | Created with `authenticationMode: Password`, `isEmailVerified: false` |
| Register the same email twice | `400 DuplicateField` |
| Email token (`customers/email-token`, 60 minutes, older tokens invalidated) | A 40-character value. **commercetools doesn't send the email**; we do |
| Confirm (`customers/email/confirm`) | `isEmailVerified: true`; the token can't be used twice (`404`) |
| Password flow (`/oauth/{project}/in-store/key=gifting/customers/token`) **before** the email is verified | **Succeeds.** We must enforce verification ourselves |
| Password flow with a wrong password | `400 invalid_customer_account_credentials` (generic) |
| Password flow with our admin API client | The customer's token carries **`manage_project`**: full project admin. Narrower scopes are refused ("Permissions exceeded") |
| Access and refresh tokens | 48-hour access tokens with refresh tokens. Revoking either works, and introspection then says `active: false` |

## Decision

1. **Accounts are commercetools customers in the `gifting` store.**
   - Store-specific customers stay separate from any shop customers in the
     same project.
   - Registration asks for first name, last name, email, password, an
     optional company name (the customer's `companyName`), and acceptance of
     the terms.
   - Any email domain is allowed.
2. **Email verification is required before sign-in.**
   - The API creates a 60-minute email token and emails a link to the
     sender app's `/verify-email` page. The link offers a resend.
   - The API refuses sign-in until `isEmailVerified` is true. It revokes the
     tokens it just received, and answers `403 email_not_verified`.
3. **Sign-in uses commercetools' OAuth 2.0 password flow**, through a
   **dedicated API client with only `manage_my_profile`**.
   - Never the admin client: the API refuses to start if the sign-in client
     has `manage_project` or any `manage_*` scope other than
     `manage_my_profile`.
   - Each call to our API carries the customer's access token. The API checks
     it with commercetools introspection (`active` and a `customer_id`),
     caching the result for 60 seconds.
   - Sign-out revokes both tokens.
4. **The browser never sees a token.**
   - The sender app keeps the access and refresh tokens in one encrypted,
     http-only cookie (A256GCM with the app's `SESSION_SECRET`). The session
     ends after 7 days at most.
   - The app renews the access token in `proxy.ts` before it expires.
5. **Abuse protection is ours.** commercetools has none on the password
   flow, so the API:
   - limits failed sign-ins (5 per email in 15 minutes);
   - limits verification emails (3 per address an hour);
   - keeps sign-in and resend answers generic.
6. **Register says when an email is taken.** It answers `409 email_taken`
   and links to sign-in. This was a product decision on 29 Oct 2026:
   - it reveals which emails have accounts, a known trade-off;
   - a taken email that isn't verified yet gets a fresh link instead;
   - a record without a password (from an older import) counts as taken,
     and never gets a link.
7. **Passwords:** 10 to 128 characters, with an uppercase letter, a
   lowercase letter, a number and a special character. A password may not
   contain the part of the email before the @. The register form shows the
   rules as a live checklist, asks for the password twice, and has a
   show/hide toggle and a Caps Lock warning (sign-in has the toggle and the
   warning too).
8. **Behind a connector.** The API's accounts module talks to an
   `IdentityProvider` interface:
   - register, find by email, email token, confirm email;
   - sign in, refresh, verify token, account, sign out.

   `ct-identity.ts` implements it for commercetools. When ADR 0013 is
   accepted it moves into the commercetools connector. Another platform
   implements the same interface with its own customer-account API, or with
   an external identity provider.

## Consequences

- There is no Google sign-in. Adding social sign-in later means an external
  identity provider, which commercetools supports through external OAuth
  token introspection.
- We own the account emails (verification, "already registered", and
  password reset later). Locally they go to Mailpit, or to `.data/outbox`
  when Mailpit isn't running. In the cloud they go through SendGrid.
- An admin must create the sign-in API client in the Merchant Center.
  Scopes: `manage_my_profile:{project}`.
- The B2B parts already in the project (Business Units, associate roles,
  member profiles, `pnpm member:add`) are no longer used for sign-in. They
  are removed in the B2C clean-up that follows.
- The rate limits are kept in memory, which fits the POC's single API
  instance. They move to MongoDB before there's more than one instance.
