# 0010 — The Gifting API is versioned under `/v1`

**Status:** Accepted (27 Oct 2026)

## Context

Four apps call the API now; a public API, webhooks and Zapier come later.
Breaking an app with an API change, or having to break external callers
later, is avoidable if the rules are set on day one.

## Decision

Every route lives under `/v1/…`, defined with `defineRoute()` with Zod
schemas for params, query, body and response. Only `/health` is unversioned.
Within v1, changes are additive (new fields, new routes). A breaking change
is `/v2`. Errors are always `{ error: { code, message } }` with a stable
`code`; expected failures are raised as `ApiError(status, code, message)`.
OpenAPI is generated from the same schemas.

## Consequences

- Apps can generate or hand-write clients against a stable contract.
- Response schemas strip unknown fields, so internal fields can't leak by
  accident.
- The public API (later) is the same v1 contract with API keys, not a second
  API.
