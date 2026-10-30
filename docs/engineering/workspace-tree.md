# Workspace tree

A map of the Gifting Marketplace monorepo as of 28 Oct 2026 (M0 scaffold).
It leaves out `node_modules`, `.git`, `.turbo`, `.next` and build output, and
collapses files that repeat. For the rules each part follows, see
[CLAUDE.md](../../CLAUDE.md); for the architecture, see
[docs/architecture/overview.md](../architecture/overview.md).

## Top level

| Folder | What lives there |
| --- | --- |
| `apps/` | Four Next.js apps: sender, recipient, vendor, ops. They talk only to the Gifting API. |
| `services/` | The Fastify Gifting API and the background worker. |
| `packages/` | Shared code: domain models, ledger, MongoDB, commercetools, channels, logger, UI library. |
| `infra/` | commercetools setup scripts and fictional seed data. |
| `scripts/` | Build helpers. |
| `docs/` | Product, architecture, engineering, plans, technical and design docs. |

## Apps and ports

| App or service | Folder | Port |
| --- | --- | --- |
| Sender dashboard | `apps/sender` | 3000 |
| Recipient experience | `apps/recipient` | 3001 |
| Vendor portal-lite | `apps/vendor` | 3002 |
| Ops admin | `apps/ops` | 3003 |
| Gifting API | `services/api` | 4000 |

## Full tree

```text
corporate-gifting-marketplace/
├── .github/workflows/ci.yml                 CI: lint, typecheck, test, build
├── .env.example                             Template for local settings (.env is gitignored)
├── .gitattributes  .gitignore  .node-version
├── AGENTS.md  CLAUDE.md  README.md  CHANGELOG.md
├── docker-compose.yml                       MongoDB (Atlas Local)
├── package.json  pnpm-workspace.yaml  pnpm-lock.yaml
├── turbo.json  tsconfig.base.json  eslint.config.mjs
│
├── apps/                                    Next.js apps (talk only to the Gifting API)
│   ├── sender/      :3000                   Sender dashboard
│   ├── recipient/   :3001                   Recipient experience
│   ├── vendor/      :3002                   Vendor portal-lite
│   └── ops/         :3003                   Ops admin
│       └── (each app has the same layout)
│           ├── app/
│           │   ├── layout.tsx
│           │   ├── page.tsx
│           │   └── api-status.tsx
│           ├── lib/api.ts                   Typed calls to the Gifting API
│           ├── components.json              shadcn CLI → packages/ui
│           ├── eslint.config.mjs  next.config.ts  postcss.config.mjs
│           └── package.json  tsconfig.json  next-env.d.ts
│
├── services/
│   ├── api/         :4000                   Fastify Gifting API
│   │   └── src/
│   │       ├── app.ts                       buildApp(): Fastify, error shape, routes
│   │       ├── app.test.ts
│   │       ├── server.ts
│   │       ├── system-routes.ts             /health, /v1/meta
│   │       ├── http/
│   │       │   ├── route.ts                 defineRoute(): Zod in and out, /v1 only
│   │       │   └── errors.ts                ApiError, errorBody()
│   │       └── modules/index.ts             The ten modules
│   └── worker/                              Background jobs
│       └── src/
│           ├── main.ts
│           └── jobs/
│               ├── index.ts                 Job registry
│               └── jobs.test.ts
│
├── packages/                                Shared workspace packages
│   ├── domain/src/                          Zod models and pure rules
│   │   ├── models.ts       (+ test)
│   │   ├── money.ts        (+ test)         Integer cents
│   │   ├── gift-status.ts  (+ test)         Gift state machine, canTransition()
│   │   ├── keys.ts         (+ test)         Idempotency keys
│   │   └── index.ts
│   ├── ledger/src/                          Append-only ledger (pure)
│   │   ├── entries.ts
│   │   ├── balance.ts
│   │   ├── ledger.test.ts
│   │   └── index.ts
│   ├── db/                                  MongoDB
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── collections.ts
│   │   │   ├── indexes.ts
│   │   │   ├── test-db.ts                   assertTestDb() guard
│   │   │   ├── db.test.ts
│   │   │   └── index.ts
│   │   └── scripts/indexes.ts               pnpm db:indexes
│   ├── commerce/src/                        The connector contract (ADR 0013)
│   │   ├── contract.ts     (+ test)         CommerceConnector, capabilities, connectorProblem
│   │   └── conformance.ts                   describeConnectorConformance(): what plug and play means
│   ├── commerce-commercetools/src/          commercetools connector: customer accounts
│   │   ├── accounts.ts     (+ test)
│   │   ├── conformance.sandbox.test.ts      pnpm test:conformance (real project)
│   │   └── index.ts                         the ConnectorFactory
│   ├── commerce-memory/src/                 in-memory connector for tests and local work
│   ├── ct/src/                              commercetools client (connectors and infra only)
│   │   ├── client.ts
│   │   ├── config.ts       (+ test)
│   │   └── index.ts
│   ├── channels/src/                        Delivery channel interface
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   ├── adapters/log.ts
│   │   ├── channels.test.ts
│   │   └── index.ts
│   ├── logger/src/                          createLogger() with redaction
│   │   ├── index.ts
│   │   └── index.test.ts
│   └── ui/                                  Shared shadcn/ui library
│       ├── components.json  postcss.config.mjs
│       └── src/
│           ├── components/                  63 shadcn components (accordion … tooltip)
│           │   ├── app-shell.tsx            ┐
│           │   ├── gift-status-badge.tsx    ├ composed by us
│           │   └── theme-provider.tsx       ┘
│           ├── hooks/
│           │   ├── use-mobile.ts
│           │   └── use-highlighted-code.ts
│           ├── lib/
│           │   ├── utils.ts                 cn()
│           │   └── highlighter.tsx
│           └── styles/globals.css           Tailwind + tokens, light and dark
│
├── infra/
│   ├── ct-setup/                            commercetools setup
│   │   ├── src/
│   │   │   ├── drafts.ts                    Store, channels, types
│   │   │   └── drafts.test.ts
│   │   └── scripts/
│   │       ├── plan.ts                      pnpm ct:plan
│   │       └── apply.ts                     pnpm ct:apply (sandbox only)
│   └── seed/                                Fictional vendors, products, company
│       ├── src/
│       │   ├── index.ts
│       │   └── seed.test.ts
│       └── scripts/seed.ts
│
├── scripts/build-service.mjs                Bundles a service; fails on undeclared deps
│
└── docs/
    ├── README.md
    ├── product/
    │   ├── vision.md
    │   ├── features.md
    │   ├── roadmap.md
    │   ├── personas.md
    │   └── glossary.md
    ├── business/
    │   ├── positioning.md
    │   └── open-questions.md
    ├── architecture/
    │   ├── overview.md
    │   ├── commercetools.md
    │   ├── data-model.md
    │   ├── flows.md
    │   ├── integrations.md
    │   ├── money-and-ledger.md
    │   ├── security.md
    │   └── decisions/                       ADRs 0001–0012 + README
    ├── design/
    │   ├── design-system.md
    │   ├── gifting-prototype.html           Clickable prototype v1
    │   └── gifting-prototype-v2.html        Clickable prototype v2
    ├── engineering/
    │   ├── getting-started.md
    │   ├── conventions.md
    │   ├── testing.md
    │   ├── git-workflow.md
    │   ├── build-log.md
    │   └── workspace-tree.md                This file
    ├── plans/
    │   ├── README.md
    │   ├── poc-plan.md
    │   ├── m0-foundations.md
    │   └── spikes.md
    ├── technical/
    │   ├── api.md
    │   ├── configuration.md
    │   ├── deployment.md
    │   └── operations.md
    └── reference/
        └── Gifting-Marketplace-POC-Architecture-v2.docx
```

## Where new code goes

| Adding… | Put it in |
| --- | --- |
| A data shape or pure business rule | `packages/domain/src` |
| A MongoDB index | `packages/db/src/indexes.ts` |
| An API route | `services/api/src/modules/<module>/` |
| A background job | `services/worker/src/jobs/` (one file per job) |
| A delivery channel | `packages/channels/src/adapters/` |
| A UI component | `packages/ui/src/components/` (never inside an app) |
| A screen | `apps/<app>/app/` |
| Seed data | `infra/seed/src` (fictional, `.example` domains only) |
