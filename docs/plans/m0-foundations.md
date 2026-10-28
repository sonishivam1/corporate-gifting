# M0: foundations and scaffold

**Status:** Building (scaffold built; spikes and setup scripts next)
**Agreed:** 27 Oct 2026 · **Scaffold built:** 27 Oct 2026 (not yet committed)

## Goal

Give the team a repository that builds, tests and runs on day one, with the
structure the architecture describes. Then M1 to M7 add features instead of
arguing about layout. The rules that matter most (money, gift states,
idempotency keys) start as tested code, not just text.

## Scope

| Area | What gets built |
| --- | --- |
| Repo | pnpm workspaces (`apps`, `services`, `packages`, `infra`), Turborepo, TypeScript base config, ESLint, `.gitignore`, `.gitattributes` (LF), `.node-version`, `.env.example` |
| Local services | `docker-compose.yml`: MongoDB Atlas Local (replica set) and Mailpit |
| CI | GitHub Actions: install, lint, typecheck, test, build |
| `@gifting/domain` | Zod models for the 8 collections; money helpers; gift status state machine; idempotency keys; order number |
| `@gifting/ledger` | Entry builders (hold, release, capture, fee, refund) and `computeBalance()` |
| `@gifting/db` | Client from env, typed collections, index definitions, `ensureIndexes` script, `assertTestDb()` |
| `@gifting/ct` | Client factory from env (client credentials), config validation; no calls in tests |
| `@gifting/channels` | `Channel` interface, registry, development `log` adapter |
| `@gifting/logger` | pino with redaction of personal and secret fields |
| `@gifting/ui` | A few shared components (shell, card, badge) |
| `services/api` | Fastify `buildApp()`, `defineRoute()`, `ApiError`, `/health`, `/v1/meta`, a registry of the ten modules |
| `services/worker` | Runner-neutral job registry with the nine planned jobs as stubs |
| `apps/*` | Four Next.js apps with Tailwind, each with a placeholder home page and `lib/api.ts` |
| `infra/ct-setup` | Drafts for the gifting store, vendor channels and custom types; `plan` (print) and `apply` (sandbox only) scripts |
| `infra/seed` | Fictional vendors and products |
| Docs | The full docs set |

Not in scope: any feature behaviour, real sign-in, database-backed tests,
commercetools calls in CI.

## Decisions

- Versions follow ambient-crm where they overlap (Node 24, pnpm 10,
  TypeScript 5, Next.js 16, React 19, Zod 4, Vitest 5, MongoDB driver 7,
  pino 10), so the team works with one toolchain.
- Internal packages are TypeScript source with no build step (ADR 0003).
- The API runs with `tsx` in development and is bundled for production with
  `tsc` output; the worker the same.
- The job runner (ADR 0011) is not wired yet; jobs are plain definitions so
  the choice stays open.

## Tests

- Domain: every allowed and refused gift transition; money helpers refuse
  floats and negatives; keys are deterministic.
- Ledger: top-up, hold, redeem, expire and vendor-cancel lifecycles; a
  redeemed gift nets to capture + fee; duplicates ignored.
- Db: `assertTestDb()` refuses non-test names; company lookups lead with
  `companyKey`; idempotency, token, code and occurrence indexes are unique.
- API: `/health`, `/v1/meta`, unknown route gives the error shape.
- Channels, logger, worker registry, seed data (fictional, `.example`
  domains, prices in cents), ct-setup drafts.

## Docs to update

All of them (first version).

## As built

**Scaffold (package 0.1), 27 Oct 2026.** Built as planned, with these
differences:

- **Module and job folders:** the API has a registry of the ten modules
  (`modules/index.ts`) instead of ten empty folders. The worker has a registry
  of the nine jobs instead of nine stub files. Each gets its own folder or
  file when it is built.
- **Service bundling:** `scripts/build-service.mjs` (esbuild) bundles our
  workspace packages into each service and keeps third-party packages
  external. The first smoke test found the API bundle needed `pino` (used only
  by `@gifting/logger`) without declaring it. The script now fails the build
  and names any undeclared package.
- **Seed import and `ct:apply`:** `pnpm seed` reports the data and stops
  (import is package 0.3). `pnpm ct:apply` is written against the SDK types
  but has not yet run against a real project; its first run is part of
  spike 4.
- **Zod 4 messages:** a missing env var gives Zod's generic message unless
  `z.string({ error })` is used; config schemas now do this, so errors name
  the variable.

**Verification** (Node 24.22, pnpm 10.25, on Windows):

| Check | Result |
| --- | --- |
| `pnpm install` | 442 packages |
| `pnpm typecheck` | 15 of 15 packages pass |
| `pnpm lint` | 15 of 15 pass, no warnings |
| `pnpm test` | 80 tests in 10 packages pass (domain 23, ledger 12, db 8, api 8, seed 6, ct-setup 5, logger 4, channels 4, ct 3, worker 3) |
| `pnpm build` | 4 Next.js apps and 2 services build with no database configured |
| Built API | `/health` gives `{"status":"ok"}`; `/v1/meta` lists 10 modules; unknown route gives `{"error":{"code":"not_found",…}}` |
| Built sender app | Renders, reaches the API ("Gifting API 0.1.0: 10 modules registered"), shared UI styles applied |
| Built worker, `ct:plan`, `seed` | Run as described above |

Not verified: CI on GitHub (no remote yet), `pnpm db:up` and `db:indexes`
(Docker not started), and anything against commercetools.

**Lessons:** bundling workspace source into services is convenient, but a
service has to declare its packages' third-party dependencies, so the build
now checks this. In the logger, keep error fields off the redaction list
(`name`, `code`): errors log `type` and `code`, and the gift short code is
`shortCode`.
