# 0004 — A modular monolith: one Fastify API and one worker service

**Status:** Accepted (27 Oct 2026)

## Context

Ten domain areas (accounts, ledger, catalog, campaigns, recipients, gifts,
fulfilment, channels, integrations, reporting) is a lot of surface for eight
weeks. Microservices would add network calls, distributed transactions and
deployment work for no benefit at POC load. A single ball of code would make
later splitting hard.

## Decision

One API service (Fastify) with one folder per module under
`services/api/src/modules`. Each module exposes a service; other modules call
that service, never its collections. Scheduled and event-driven work runs in
a separate worker service that uses the same module services. Apps call the
API over HTTP only, and never call each other's backends or commercetools.
Next.js route handlers are not used for business logic.

## Consequences

- One deployable for the API and one for the worker; in-process calls between
  modules.
- Module boundaries are a convention, checked in review (and later with a
  lint rule on import paths).
- A module can be lifted into its own service later by putting HTTP in front
  of its service interface.
- Fastify gives schema-first routes, fast `inject()` tests and generated
  OpenAPI.
