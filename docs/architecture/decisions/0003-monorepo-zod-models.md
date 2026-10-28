# 0003 — pnpm and Turborepo monorepo with Zod-first models

**Status:** Accepted (27 Oct 2026)

## Context

Four web apps, one API, one worker and shared rules (money, gift states,
idempotency keys) must stay in step. A team of about 2.5 people can't afford
to publish and version internal packages.

## Decision

One TypeScript repository with pnpm workspaces (`apps/*`, `services/*`,
`packages/*`, `infra/*`) and Turborepo to run tasks in dependency order with
caching. Shapes are Zod schemas in `@gifting/domain`; TypeScript types are
inferred from them. Internal packages are consumed as TypeScript source
(`workspace:*`, `exports` pointing at `src`), with no build step.

## Consequences

- A rule changes in one place and every app, the API and the worker see it at
  once; typecheck catches every caller.
- API input and output schemas and the database schemas come from the same
  definitions.
- The API and worker run TypeScript through `tsx` in development and are
  bundled for production; Next.js apps transpile workspace packages
  (`transpilePackages`).
- Turborepo's cache makes `lint`, `typecheck`, `test` and `build` fast in CI.
