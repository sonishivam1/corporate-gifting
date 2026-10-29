# 0009 — A hosted identity provider (Auth0 or Google Cloud Identity Platform)

**Status:** Superseded by [0015](0015-commerce-customer-accounts.md) on 29 Oct 2026. It was accepted on 28 Oct 2026 as Auth0, Free plan; the product then became B2C, with accounts in the commerce platform.

## Context

Company members, vendor staff and ops need sign-in. Recipients do not: their
gift token is the credential. Roles live in commercetools (Associate Roles
on Business Units), so the identity provider only has to prove who someone
is. SSO per company is a "later" feature but should not need a rewrite.

## Options

| Option | For | Against |
| --- | --- | --- |
| Auth0 | Fast setup, magic links, organisations, SAML/OIDC later | Cost at scale |
| Google Cloud Identity Platform | Fits our Google Cloud deployment ([ADR 0014](0014-google-cloud.md)), cheap, SAML and OIDC per tenant | Fewer ready-made B2B features (organisations, invitations) than Auth0 |
| Build our own | Full control | Security risk, time we don't have |

## Proposed decision

A hosted provider, chosen with the practice's preference in week 1. Default
to Auth0 if there is no preference. The API verifies the provider's JWT,
resolves the member's commercetools Associate and roles, and builds the
request scope from them. Apps use the provider's Next.js SDK; no app holds a
provider secret beyond its own client id.

## Consequences

- Scope (`companyKey`, `teamKey`, roles) comes from the verified session,
  never the request body.
- Local development uses a development sign-in switch (disabled when
  `NODE_ENV=production`) so the flows can be built before the tenant exists.

## Decision (28 Oct 2026)

**Auth0 on its Free plan.**
- **It's free now:** up to 25,000 monthly active users.
- **It needs no company Google account to start.** Auth0's developer keys
  cover Google sign-in while we build. Our own Google OAuth client
  replaces them before any external demo.
- **It covers what we need:** hosted login with Google and email and
  password, verification and reset emails, and RBAC.

Joining is invite-only, with work emails only. Auth0 proves who someone is,
and the Gifting API decides access from the commercetools member record.

The development sign-in switch above is replaced by tests that sign their
own tokens. The build plan is [M1: sign-in](../../plans/m1-sign-in.md).

