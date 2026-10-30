# Gifting Marketplace: guide for coding agents

The Gifting Marketplace is a Snappy-style corporate gifting platform on
commercetools. Companies fund team budgets and send gifts through email, SMS,
Slack, Teams, links or QR codes. Recipients choose from a multi-brand budget
collection, and the vendor that owns the item ships it. It is our
commercetools practice's gifting accelerator, built first as an 8-week POC.
Keep every company, vendor, brand, person and figure in demo data fictional
(see "Demo data").

Read this file before changing anything. Product and architecture detail lives
in [`docs/`](docs/README.md); this file is the short list of what every change
must respect.

## Where we are (27 Oct 2026)

- **Agreed:** architecture v2, the multi-brand marketplace
  ([overview](docs/architecture/overview.md),
  [decisions](docs/architecture/decisions/README.md)). Scope is the 16 POC
  capabilities in the [feature inventory](docs/product/features.md), built in
  eight weekly milestones ([POC plan](docs/plans/poc-plan.md)).
- **Built (M0 scaffold):** the monorepo. It has four Next.js apps, the
  Fastify API with `/health` and `/v1/meta`, the worker shell, and the shared
  packages. The pure rules in `@gifting/domain` and `@gifting/ledger` (gift
  state machine, money, balances) have tests. The repo also has CI,
  commercetools setup drafts and fictional seed data
  ([M0 plan](docs/plans/m0-foundations.md)).
- **Built ahead of plan (28 Oct):** the [sender dashboard](docs/plans/sender-dashboard.md):
  Home, Browse gifts, Campaigns and the send flow, on real API routes and
  MongoDB. Products and the demo company come from `infra/seed` until
  commercetools is set up.
- **Built (29 Oct):** real register and sign-in (B2C, commercetools customer
  accounts, [ADR 0015](docs/architecture/decisions/0015-commerce-customer-accounts.md))
  behind plug-in commerce connectors
  ([ADR 0013](docs/architecture/decisions/0013-commerce-adapters.md)). The
  dashboard sits behind that sign-in; its company and team still come from
  the development session (`DEV_AUTH=1`, "workspace" routes) until the B2C
  workspace model is decided.
- **Next:** the week-1 [spikes](docs/plans/spikes.md). Spike 1, the
  company-balance order, gates everything in M4. After the spikes comes M1:
  accounts and money.
- The live plan is [`docs/product/roadmap.md`](docs/product/roadmap.md).

## Commands

Node 24 and pnpm 10. On Windows with fnm, prefix commands with
`fnm exec --using=24 --` and call `pnpm.cmd`.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Every app and the API in watch mode (ports below) |
| `pnpm dev:all` | `db:up`, `seed:demo` (which also ensures indexes), then `dev`: everything in one command |
| `pnpm lint` | ESLint in every package |
| `pnpm typecheck` | `tsc --noEmit` in every package (`next typegen` first in apps) |
| `pnpm test` | Unit tests in every package (no database, no network) |
| `pnpm test:integration` | API tests against throwaway `gifting_test_*` databases (needs `pnpm db:up`) |
| `pnpm build` | Production build of every app and service; must never need a database or commercetools |
| `pnpm db:up` / `pnpm db:down` | Local MongoDB (Atlas Local) in Docker; `db:up` waits until MongoDB accepts writes |
| `pnpm db:indexes` | Create the MongoDB indexes (`packages/db`) |
| `pnpm seed:demo` | Write the demo company's accounts, top-ups, collections and directory, and 30 days of demo campaigns and gifts, to MongoDB; safe to repeat |
| `pnpm ct:plan` | Print the commercetools setup drafts (store, channels, types); no calls |
| `pnpm ct:apply` | Set up the project from `.env`: types, product types, tax, zone and shipping, channels, store, associate roles, gift categories. Creates what's missing and adds missing fields and attributes; safe to re-run |
| `pnpm seed` | Import the fictional products and stock, 250 demo customers, and 5 demo companies with 10 teams (Business Units) through the Import API (run `ct:apply` first) |
| `pnpm member:add -- --email … --company … [--team …] --role … [--company-name …]` | Add a real person (work email) to a company so they can sign in (M1 phase A; invitations come in phase B). `--company-name` creates the company, with a General team, if its key is new |
| `pnpm catalog:extract` | Read the Christie Cookie storefront into `.data/catalogs/christie-cookie.json` (gitignored; with the client's permission) |
| `pnpm catalog:import` / `pnpm catalog:remove` | Import that snapshot into the project (vendor channel, categories, products with images, stock), or delete it all again |
| `pnpm worker` | Start the worker (today: lists the registered jobs) |
| `pnpm test:conformance` | The connector conformance suite against the commercetools project in `.env` (creates and deletes `.example` test customers; never in CI) |

| App or service | Port |
| --- | --- |
| `apps/sender` | 3000 |
| `apps/recipient` | 3001 |
| `apps/vendor` | 3002 |
| `apps/ops` | 3003 |
| `services/api` | 4000 |

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint,
typecheck, unit tests, integration tests (against a MongoDB service
container) and the build on every push and pull request. Keep it green.

## Layout

```
apps/<sender|recipient|vendor|ops>/   Next.js apps; talk only to the Gifting API
  app/                                 routes (App Router)
  lib/api.ts                           typed calls to the Gifting API
services/api/src/
  app.ts                               buildApp(): Fastify, error shape, routes
  http/route.ts                        defineRoute(): Zod in and out, /v1 only
  http/errors.ts                       ApiError, errorBody()
  modules/index.ts                     the ten modules; each gets modules/<module>/ when built
services/worker/src/
  jobs/index.ts                        job registry; each job moves to its own file when built
scripts/build-service.mjs              bundles a service; fails on undeclared dependencies
packages/domain/src/                   Zod models and pure rules: money, gift states, keys
packages/ledger/src/                   ledger entry builders and the balance rule (pure)
packages/db/src/                       MongoDB client, collections, indexes, test-db guard
packages/commerce/src/                 the connector contract and conformance suite
packages/commerce-<platform>/src/      one connector per platform (commercetools, memory)
packages/ct/src/                       commercetools client and helpers (connector and infra only)
packages/channels/src/                 Channel interface, registry, adapters
packages/logger/src/                   createLogger() with redaction
packages/ui/src/components/            every shadcn/ui component, plus app-shell, gift-status-badge, theme-provider
packages/ui/src/styles/globals.css     the one stylesheet: Tailwind, shadcn tokens (every app is light only)
infra/ct-setup/                        drafts and scripts for the commercetools project
infra/seed/                            fictional vendors, products and demo customers
infra/catalog/                         client catalog extract and import (code only; data in .data/, gitignored)
docs/                                  product, architecture, engineering, plans, technical
docs/engineering/build-log.md          history of every change, newest first
```

API modules: `accounts`, `ledger`, `catalog`, `campaigns`, `recipients`,
`gifts`, `fulfillment`, `channels`, `integrations`, `reporting`. A module owns
its routes, services and collections. It calls another module only through
that module's exported service, never its collections.

## Rules every change follows

**Commerce goes through connectors** ([ADR 0013](docs/architecture/decisions/0013-commerce-adapters.md), [plan](docs/plans/commerce-connectors.md))
- The commerce platform is a plug-in. The product talks to it only through
  the contract in `@gifting/commerce`. Each platform is a package,
  `packages/commerce-<platform>`, and `COMMERCE_CONNECTOR` picks one per
  deployment. Taking on a platform means writing its connector, never
  changing the product ([writing a connector](docs/engineering/writing-a-connector.md)).
- Only connector packages and `infra/*` import `@gifting/ct` or a platform
  SDK; ESLint enforces it. Tests stand in a platform with
  `@gifting/commerce-memory`. A connector is done when it passes the
  conformance suite (`@gifting/commerce/conformance`).
- Differences between platforms are `capabilities` (today: `signIn` is
  `password` or `hosted`). Check those, never a platform's name.
- Products, prices, stock, carts, orders, payments, tax and shipments live
  in the platform. Never copy them into MongoDB. Keep the reference
  (`{ connection, id }`) and read the rest live.
- Apps never call a commerce platform, and no platform credential reaches a
  browser.
- Each concern gets its own scoped API client (API, import, event consumer).
  Scopes are listed in [commercetools design](docs/architecture/commercetools.md).

**MongoDB holds only what commercetools can't** ([ADR 0002](docs/architecture/decisions/0002-mongodb-for-platform-data.md))
- Eight collections: `accounts`, `ledgerEntries`, `collections`,
  `recipients`, `campaigns`, `gifts`, `integrations`, `processedEvents`. A new
  collection needs a decision record.
- Shapes are Zod schemas in `packages/domain`; indexes are in
  `packages/db/src/indexes.ts`. Indexes for member lookups (lists, filters)
  start with `companyKey` or `teamKey`; the unique indexes are the
  exactly-once guards and must stay unique (a test checks).

**Money** ([ADR 0005](docs/architecture/decisions/0005-company-balance-payment.md), [ADR 0007](docs/architecture/decisions/0007-append-only-ledger.md))
- Amounts are integer cents (`amountCents`) with a currency, never floats.
  Use the helpers in `@gifting/domain` (`money.ts`).
- The ledger is append-only. Never update or delete an entry; correct with an
  `adjustment`. Balances are computed by `@gifting/ledger`, never stored.
- Every entry has a deterministic idempotency key from `ledgerKeys` (for
  example `capture:<giftId>:<holdNo>`), and a unique index enforces it. A retry
  writes nothing new.
- A gift's status change and its ledger entries are written in one MongoDB
  transaction.
- Redemption orders carry real totals and are paid by a `company-balance`
  Payment. Never use a 100% discount to zero an order (that was v1).

**Redemption is exactly once**
- Claim with one `findOneAndUpdate` that moves the gift from `sent` or `opened`
  to `redeeming`; a `null` result means someone else got there first.
- The commercetools order number is `GFT-<giftId>`, so a replay cannot
  create a second order.
- The server re-reads the SKU, price, stock, country and budget. Nothing about
  price comes from the browser.
- Gift status changes go through `canTransition()` in `@gifting/domain`.

**Scope and access**
- Every API call works inside the caller's company and team, taken from the
  session, never from the request body. Something outside that scope is
  "not found", never "forbidden".
- Vendors see only orders routed to their channel, and only shipping fields.
- Recipient links are 32 random bytes, stored only as a SHA-256 hash.
  Short codes are rate-limited.

**Events and jobs**
- commercetools Subscription messages are at least once. Record each message
  id in `processedEvents` before acting, and skip duplicates.
- Jobs are idempotent: running one twice changes nothing the second time.

**Channels and integrations** ([ADR 0008](docs/architecture/decisions/0008-channel-adapters.md))
- Every delivery channel implements `Channel` from `@gifting/channels`.
  Campaigns and gifts never import a provider SDK.
- Every email, account or gift, goes through the one mailer in
  `services/api/src/mail/mailer.ts`, so `SMTP_URL` alone picks the provider.
  Outside production it falls back to `.data/outbox`; production refuses to
  start without SMTP.
- Provider secrets live in a secrets manager. `integrations` stores only a
  `secretRef`.

**HTTP API** ([ADR 0010](docs/architecture/decisions/0010-api-versioning.md))
- Routes live under `/v1/…`, built with `defineRoute()` with Zod schemas
  for input and output. Only `/health` is unversioned. Within v1, changes
  are additive.
- Every route says who may call it: `auth: "account"` (the default),
  `"ops"` or `"public"` ([register and sign-in plan](docs/plans/m1-register-sign-in.md)).
  Handlers take the person from `ctx.account`, never from the request.
  Apps call the API from the server with the customer's commercetools
  access token, kept in an encrypted http-only cookie; no token reaches a
  browser ([ADR 0015](docs/architecture/decisions/0015-commerce-customer-accounts.md)).
- Errors are `{ error: { code, message } }`. Raise expected failures with
  `ApiError(status, code, message)`.

**Logging**
- Use `@gifting/logger` in server code, workers and scripts, never `console`.
- Never log recipient names, emails, phones, birthdays or addresses. Never
  log gift tokens, codes, keys or connection strings. Log ids and codes as
  fields, and errors as `{ err }`.

**UI** ([ADR 0012](docs/architecture/decisions/0012-shadcn-ui.md), [design system](docs/design/design-system.md))
- Build every screen from shadcn/ui components in `@gifting/ui`
  (`import { Button } from "@gifting/ui/components/button"`). Use a
  shadcn component if one exists; otherwise compose one in
  `packages/ui/src/components`. No app defines its own colours, fonts or
  component styles; use the token classes (`bg-primary`,
  `text-muted-foreground`), never raw colours.
- Add or refresh components with the CLI from an app folder
  (`cd apps/sender && pnpm dlx shadcn@4.23.0 add <name>`), then move any new
  dependencies and hooks it put in the app into `packages/ui`.
- Prefer wrapping a shadcn component to editing it; edits are lost on a
  refresh with `-o`.
- The POC look is minimal; the recipient page takes the company's colours
  (`--primary`) and logo.
- Apps import `@gifting/domain` for types and pure rules only, never
  `@gifting/db`, `@gifting/ct` or `@gifting/channels`.

**Demo data**
- `infra/seed` holds fictional vendors, brands, products, companies and
  customers, with `.example` domains only. Use no real companies, people or
  brands, and no customer figures.
- The one exception is the client's own catalog (Christie Cookie), used with
  their written permission. It lives only in `.data/` (gitignored) and in the
  commercetools project, never in git, tests, docs or screenshots. Its vendor
  contact address stays a `.example` placeholder, so the POC never emails
  the real company. Never collect people's data from any site.

## Definition of done for a milestone step

0. Write the step's plan in `docs/plans/` from the template, and agree it
   before building.
1. Models in `packages/domain`, indexes in `packages/db`, seed data in
   `infra/seed` where needed.
2. Pure rules with unit tests. Then API routes and services in the module,
   with tests through `app.inject()`.
3. App pages that call the API.
4. Tests for what must be refused: another company, another team, a second
   claim, a retried ledger write, an over-budget item.
5. Break what a test guards (drop the scope filter, say), watch the test
   fail, then restore it.
6. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.
7. Update the docs in the same change: `docs/product/features.md`,
   `docs/architecture/data-model.md`, `docs/technical/api.md`, the README
   progress table, and `docs/product/roadmap.md` ("Last updated").
8. Record it: an entry in `docs/engineering/build-log.md`, the plan's **As
   built** section, and a line in `CHANGELOG.md` if users would notice.

## Safety

- Never print, log or commit a connection string, commercetools client
  secret, Stripe key or provider token. They live only in gitignored `.env`
  files.
- Tests never touch a shared database. Database tests use throwaway
  `gifting_test_*` databases, and `assertTestDb()` guards them.
- `pnpm ct:apply`, `pnpm seed` and `pnpm catalog:*` write only to the project named in `.env`,
  and refuse a project key without `sandbox` or `dev` in it unless
  `CTP_SETUP_PROJECT_KEY` names that exact key (the POC project
  `corporate-gifting`). Never set it for a client's live project.
- Commit and push only when asked. Work branches start from `develop` and
  return to it by pull request; `develop` → `qa` → `main` are promotions
  ([git workflow](docs/engineering/git-workflow.md)). Before committing, scan
  the diff for secrets. Use Conventional Commits: `feat(gifts): …`, `fix(ledger): …`,
  `docs: …`.
- Files are UTF-8 with LF line endings and no BOM.

## Gotchas

| Symptom | Cause and fix |
| --- | --- |
| `Error parsing package.json` at character 1 | A BOM (PowerShell `Set-Content -Encoding utf8` adds one). Re-save without BOM |
| `Cannot find name 'PageProps'` in an app | Run `pnpm typecheck` (it runs `next typegen`) |
| Wrong Node version errors | Run through `fnm exec --using=24 --`; the machine default may be Node 20 |
| Files gain CRLF on Windows | Write with `newline=""` in Python, or use the editor tools; `.gitattributes` normalises on commit |
| A `findOneAndUpdate` claim "works twice" in a test | The filter is missing `status: { $in: ["sent", "opened"] }`; the lock lives in the filter |
| A transaction fails locally | MongoDB must run as a replica set; use `pnpm db:up` (Atlas Local), not a plain `mongo` image |
| `build-service: the bundle imports packages missing from package.json` | A workspace package the service uses imports a third-party package; add it to the service's own `dependencies` (the bundle keeps third-party code external) |
| After `shadcn add`, an app's `package.json` gained packages, or a component imports `@/hooks/…` | The CLI writes dependencies and hooks into the app it runs from. Move them to `packages/ui` (`package.json`, `src/hooks`, `src/lib`) and import `@gifting/ui/hooks/…` |
| A Tailwind class used in an app or `packages/ui` has no style | `@source` in `packages/ui/src/styles/globals.css` must cover the file; it scans `apps/**` and `packages/ui/src/**` |
| `next/font` fonts don't apply (the page shows the system font) | Put `fontVariables` on `<html>`, not `<body>`: `--font-sans` is resolved on `:root` |
| A Next.js app can't see a variable from the root `.env` | By design: apps read only their own `.env.local` (see `apps/<app>/.env.example`) |
| `pnpm --filter <pkg> import` runs pnpm's own import command | Call scripts named like pnpm commands with `pnpm --filter <pkg> run <script>` |
| Re-importing a team unit fails: "Store mode does not allow editing stores" | The Import API can't update a Division that inherits stores; `pnpm seed` creates missing teams and leaves existing ones |
| The email provider accepts an email (API answers 202, nothing in `.data/outbox`) but it never arrives | `MAIL_FROM`'s domain isn't authenticated in the provider and has a strict DMARC policy (royalcyber.com does), so the receiver quarantines it. Use a personal verified sender, or authenticate the domain |
| `COMMERCE_CONNECTOR=<name> is not installed` | Add `@gifting/commerce-<name>` to `services/api/package.json`; `src/commerce/installed.ts` is regenerated before dev, build, typecheck and test |
| `gifting-mongo` exits with `ReplicaSetNoPrimary` / `RSGhost` | The replica set config stores the container hostname. `docker-compose.yml` now pins `hostname: gifting-mongo`; a volume created before that needs resetting once (`docker compose down -v`, then `pnpm dev:all`) |
| A write fails with code 10107 (not primary) | Atlas Local answers pings before it elects a primary. `pnpm db:up` now waits for a writable primary (`--wait` and the compose healthcheck); a plain `docker compose up -d` doesn't |
| `next build` tries to prerender a page and fails calling the API | Something caught the error `cookies()` throws to mark a page dynamic. Read cookies outside `try`, and catch only `ApiCallError` |
| Zod's message for a missing env var says "expected string, received undefined" | Zod 4 only uses `.min()` messages when a value is present; pass `{ error: "X is not set." }` to `z.string()` |
