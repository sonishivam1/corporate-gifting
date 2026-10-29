# Build log

How the Gifting Marketplace was built, change by change, newest first: what
changed, why, how it was verified, and what we learned. Read it to understand
the product's history. Read [plans/](../plans/) for the plan behind each step,
and the [roadmap](../product/roadmap.md) for what comes next.

**Every change adds an entry here** (see the definition of done in
[CLAUDE.md](../../CLAUDE.md)). An entry is short: the commits, what and why,
how it was verified, and any lesson worth keeping.

---

## 28 Oct 2026

### Prototype palette and single-gift sends
- **What:** the theme tokens in `packages/ui/src/styles/globals.css` now use
  the prototype's palette (light, plus a derived dark set), with new
  `success`, `warning`, `info` and `tile-<category>` tokens. The status
  badges use them instead of raw Tailwind colours. In the sender app, "Let
  them choose" and the Home collections strip are hidden behind
  `LET_THEM_CHOOSE` in `apps/sender/lib/features.ts`.
- **Why:** review feedback: the neutral shadcn theme read as black and
  white, and sends should offer one specific gift for now.
- **Verified:** lint and typecheck for `packages/ui` and `apps/sender`; the
  served CSS carries the new tokens; the running app no longer shows the
  hidden option.

### Sender dashboard: Home, Browse gifts, Campaigns and the send flow
- **What:** the first working screens, built ahead of M1 to M3 as agreed in
  the [sender dashboard plan](../plans/sender-dashboard.md) (POC plan
  change 1).
  - `@gifting/domain`: campaign `greeting`, `recipientIds` and `reminders`;
    account `holdsUpdatedAt`; pure rules for the estimate, approval,
    delivery channel, funnel and collection matching; API view schemas
    shared with the apps.
  - API modules `accounts`, `ledger`, `catalog`, `recipients`, `gifts` and
    `campaigns` with 15 routes. Development sign-in from headers. Submit
    and approve run in one MongoDB transaction with holds.
  - `infra/seed`: categories, occasions and descriptions on products; the
    demo company's thresholds, approvers and members; collections;
    directory; opening top-ups. `pnpm seed:demo` writes them.
  - `@gifting/ui`: `sidebar-shell`, `choice-card`, `greeting-card`,
    `campaign-status-badge`, `qr-code` (with `qrcode`), `lib/toast`.
  - `apps/sender`: Home, Browse gifts, Campaigns, campaign detail with
    approve and decline, and the four-step send flow with a Done screen.
  - `pnpm dev:all`, an API startup check for MongoDB, integration tests
    with a MongoDB service container in CI.
- **Why:** a demoable sender path early, on the real module boundaries.
- **Verified:** lint, typecheck, unit tests and build pass. 29 integration
  tests pass. Break and restore: dropping the team filter, the account
  lock or the balance check each fails a test. The balance check first
  failed nothing, which exposed an untested path (approving after the
  budget ran down); that test was added. Pages render against the seeded
  demo data.
- **Learned:**
  - Break and restore earns its keep: a guard can pass every test because
    another guard covers the tested path, and still be the only guard on
    an untested one.
  - Atlas Local stores the container hostname in its replica set config;
    pin `hostname` or a recreated container comes back with no primary.
  - It also answers pings before it elects a primary, so wait for
    `isWritablePrimary` before writing.
  - In Next.js, never call `cookies()` inside a `try` whose `catch` swallows
    everything: it hides the signal that marks a page dynamic, and the
    build then tries to prerender it.
  - Gift links can be shown only once when only their hashes are stored,
    so `links.csv` as a later download doesn't fit; the Done screen offers
    the CSV instead.

### Cloud environment moves from AWS to Google Cloud (ADR 0014)
- **What:** the planned POC cloud is now Google Cloud in `us-central1`, the
  same region as the commercetools project
  ([ADR 0014](../architecture/decisions/0014-google-cloud.md)):
  - Cloud Run for the apps, API and worker;
  - a load balancer with Cloud CDN and Cloud Armor;
  - Pub/Sub for commercetools events, with a dead-letter topic;
  - Secret Manager, Artifact Registry, and Workload Identity Federation
    for CI;
  - MongoDB Atlas on GCP;
  - SendGrid for email.

  ADR 0009 now offers Google Cloud Identity Platform instead of Cognito.
  Deployment, configuration, operations, security, integrations, the
  overview and the POC plan are updated.
- **Why:** we have paid Google Cloud capacity. No code depended on AWS.

### On GitHub, with develop, qa and main
- **What:** the repository is pushed to
  [royal-cyber-inc/corporate-gifting](https://github.com/royal-cyber-inc/corporate-gifting)
  (`04e1397` on `main`), with `develop` and `qa` branched from it. CI now runs
  on pushes to all three, as well as on every pull request. The
  [git workflow](git-workflow.md) describes the flow: feature branches into
  `develop`, then `develop` → `qa` → `main` by pull request. It also covers
  hotfixes and the branch-protection settings to turn on. The deployment doc
  maps `qa` to the QA environment and `main` to the demo environment (from
  M7).
- **Why:** the team works in parallel from `develop`, and QA tests a stable
  `qa` while new work continues.

---

## 27 Oct 2026

### shadcn/ui in `@gifting/ui`
- **What:** shadcn/ui set up in its monorepo layout (style `radix-nova`).
  - All 63 registry components are installed in `packages/ui`, along with
    its hooks, `cn` and a code highlighter.
  - The shared stylesheet `@gifting/ui/globals.css` holds Tailwind and the
    shadcn tokens, light and dark.
  - Each app has a `components.json` and re-exports the ui PostCSS config.
    Its layout imports the stylesheet and wraps pages in `ThemeProvider`
    and `TooltipProvider`, with a `Toaster`.
  - The old `Shell`, `Card` and `GiftStatusBadge` are now `app-shell` and
    `gift-status-badge`, built on shadcn's Separator and Badge. The app
    pages use shadcn's Card.
  - Recorded as [ADR 0012](../architecture/decisions/0012-shadcn-ui.md) and
    in the [design system](../design/design-system.md).
- **Why:** one component library for all four apps, so they look and behave
  the same and branding becomes a token change.
- **Verified:** lint and typecheck pass in all 15 packages, including every
  generated component under the repo's strict TypeScript. Tests and the
  build (4 apps, 2 services) pass. The built sender app renders shadcn Cards
  with the shared tokens, follows the system's dark mode and has no console
  errors.
- **Lessons:**
  - Run the shadcn CLI from an app folder. It writes components into
    `packages/ui`, but puts new npm dependencies and hooks in the app, so
    move them by hand.
  - The template's `@source "../../../apps/**"` is one level short for
    `packages/ui/src/styles`. Ours uses `../../../../apps/**`.

### Monorepo scaffold (M0 package 0.1)
- **What:** the repository at `C:\work\corporate-gifting-marketplace`:
  - pnpm workspaces and Turborepo, with four Next.js apps (sender, recipient,
    vendor, ops), the Fastify API (`/health`, `/v1/meta`, `defineRoute`,
    `ApiError`) and the worker job registry;
  - shared packages: `domain` (Zod models for the eight collections, money,
    gift state machine, idempotency keys, order numbers), `ledger` (entry
    builders, `computeBalance`), `db` (client, indexes, test-database guard),
    `ct` (client, config, sandbox guard), `channels` (interface, registry, log
    adapter), `logger` (pino with redaction) and `ui`;
  - `infra/ct-setup` drafts with `ct:plan` and `ct:apply`, and fictional seed
    data in `infra/seed`;
  - CI, Docker Compose (Atlas Local, Mailpit) and `.env.example`.
- **Why:** the team can start the spikes and M1 on a structure that already
  matches the architecture. The money and gift-state rules start as tested
  code.
- **Verified:** typecheck, lint, 80 unit tests and the production build all
  pass. Smoke tests: built API health, meta and error shape; built sender
  app reaching the API; worker; `ct:plan`. Details are in the
  [M0 plan](../plans/m0-foundations.md#as-built).
- **Lessons:**
  - A service bundle must declare every third-party package that our
    workspace packages import. `build-service.mjs` now enforces this.
  - Zod 4 needs `z.string({ error })` for missing-variable messages.
  - The logger's redaction list must not include fields errors use.

### Documentation set
- **What:** the full docs set, modelled on ambient-crm's:
  - product: vision, personas, features, roadmap, glossary;
  - architecture: overview, data model, commercetools design, money and the
    ledger, key flows, channels and integrations, security, and 11 decision
    records;
  - design, engineering, plans (POC plan, M0, spikes), technical and
    business (positioning, open questions);
  - `README.md`, `CLAUDE.md`, `AGENTS.md` and `CHANGELOG.md`.
- **Why:** architecture v2 (the multi-brand marketplace) is agreed. Writing
  it down in the repository keeps the code and the design in the same review.
- **Source:** *Corporate Gifting Marketplace — POC Architecture v2* (copy in
  [docs/reference](../reference/)).
