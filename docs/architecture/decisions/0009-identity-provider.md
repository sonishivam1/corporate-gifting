# 0009 — A hosted identity provider (Auth0 or Cognito)

**Status:** Proposed (27 Oct 2026). Decide before M1.

## Context

Company members, vendor staff and ops need sign-in. Recipients do not: their
gift token is the credential. Roles live in commercetools (Associate Roles
on Business Units), so the identity provider only has to prove who someone
is. SSO per company is a "later" feature but should not need a rewrite.

## Options

| Option | For | Against |
| --- | --- | --- |
| Auth0 | Fast setup, magic links, organisations, SAML/OIDC later | Cost at scale |
| Amazon Cognito | Fits an AWS deployment, cheap | Rougher developer experience; SSO setup is more work |
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
