# Build log

How the Gifting Marketplace was built, change by change, newest first: what
changed, why, how it was verified, and what we learned. Read it to understand
the product's history. Read [plans/](../plans/) for the plan behind each step,
and the [roadmap](../product/roadmap.md) for what comes next.

**Every change adds an entry here** (see the definition of done in
[CLAUDE.md](../../CLAUDE.md)). An entry is short: the commits, what and why,
how it was verified, and any lesson worth keeping.

---

## 30 Oct 2026

### Recipient list upload in the send flow
- **What:** "Upload a list" on the recipients step, as agreed in the
  [recipient upload plan](../plans/recipient-upload.md).
  - `@gifting/domain`: `parseRecipientCsv` (headers in any order and case,
    quoted fields, a byte order mark, problems by line, repeats used once),
    `uploadRowName`, `nameFromEmail` (moved from the API), and the
    `recipientImportInput` and `recipientImportView` schemas.
  - API: `POST /v1/recipients/import`. Each row joins the company's
    directory through one `ensure()` that adds or matches by email, shared
    with "Add someone by email". It logs counts only.
  - Sender app: a dialog that reads the file in the browser, previews the
    people and the skipped lines, and on confirm adds them to the list and
    ticks them. Template download.
- **Why:** sending to a whole team meant typing every address, with names
  guessed from emails.
- **Verified:** 7 parser tests and 7 integration tests (new people with
  names and `source: "csv"`, an existing email matched and its name kept,
  a repeat upload adding nobody, two racing uploads adding one person, the
  company scope, refusals writing nothing, a campaign sent to uploaded
  people). Break and restore: dropping `companyKey` from the match fails
  the scope test.

### Sender: no occasion choice; email the only delivery
- **What:** Browse gifts loses its occasion filter, and the greeting step
  its occasion choice. Campaigns still carry an occasion (the API requires
  one), fixed at "thanks". An unnamed campaign is named after its headline
  and send date ("Happy birthday! · 30 Oct") instead of the occasion. The
  delivery channel cards are hidden behind `CHANNEL_CHOICE` in
  `apps/sender/lib/features.ts`, and every campaign goes by email.
- **Why:** review feedback: occasions added a choice that didn't change the
  gift, and email is the only channel that sends today.
- **Also:** the gift step has a search over name, brand, vendor and option
  labels, with a count of what matches. The live catalog lists up to 261
  products.
- **Verified:** typecheck and lint for `apps/sender`.

### develop merged; the catalog moves behind the commerce connector
- **What:** `develop` (sign-in on commercetools customer accounts, commerce
  connectors per ADR 0013, the Home overview, branded emails) merged into
  the sender dashboard branch. The API may no longer import `@gifting/ct`,
  so the catalog moved behind the connector, as ADR 0013 planned for M2:
  - `@gifting/commerce`: an optional `catalog` in the contract
    (`listItems`, `searchItems`, `getItem`) with neutral `CatalogItem`,
    `CatalogSearch` and `CatalogMatch` types, still contract v1. The
    conformance suite checks that a search returns exactly the variants
    that fit.
  - `@gifting/commerce-commercetools`: the mapping, query and reads moved
    from `@gifting/ct` and the API. The catalog uses its own read-only
    client (`CTP_API_*`); without it the connector has no catalog.
  - `@gifting/commerce-memory`: `memoryCatalog(items)`, and a catalog option.
  - `@gifting/domain`: `categoryFromTags` and `occasionsFromTags`.
  - API: `connectorCatalog` (cache, cards, per-variant re-check) replaces
    `ctCatalog`; `CATALOG_SOURCE` is gone. The demo catalog serves when the
    connector has none.
- **Why:** develop's connector rule, and ADR 0013 puts the catalog in the
  contract with M2.
- **Verified:** the conformance catalog checks pass on the memory
  connector. On the real project the commercetools connector's search is
  exact per variant, and `catalog:check` through `COMMERCE_CONNECTOR`
  matches all five collections. Lint, typecheck, unit tests, build and
  integration tests: see the plan's As built.
- **Learned:** a connector can keep its platform's quirks (stock per
  channel, ids in search results) entirely inside it; the contract only
  needed keys, SKUs and a budget.

---

## 29 Oct 2026

### Recipient pages, and the shipping and tax estimate (M4)
- **What:** the recipient app (`/r/[token]`): the gift page with its greeting
  card and choices, the gift on its own page, the address form (checked again
  on the server; the link never reaches the browser's own API calls), the
  confirmation with the order number, and a plain notice for a used, expired
  or unknown link. They use the shared UI kit and theme, and the security
  headers (no referrer, no cache, no framing, CSP). The hold at send is now
  the budget plus `GIFT_ESTIMATE_PERCENT` for shipping and tax, shown on the
  sender's Review step as "estimated shipping and tax"; redemption captures
  the real cost and releases the rest.
- **Why:** shipping and tax are only known when the recipient chooses, so,
  like other gifting platforms, the hold is an estimate that is settled at
  redemption. It is a business decision how much to pad.
- **Verified:** an integration test for the hold, the estimate and the
  release at redemption; the whole flow run in a browser against the
  commercetools sandbox (send, email, choose, address, order, ledger, sender
  funnel and spend). See `docs/engineering/m4-test-report.md`.

### Gift redemption into commercetools orders (M4 backend)
- **What:** a recipient's link opens a gift (`GET /v1/r/:token`, no sign-in;
  the secret in the path is the credential) and choosing an item and address
  (`POST /v1/r/:token/redeem`) claims the gift atomically, creates one order
  `GFT-<giftId>` and, in one transaction, marks the gift redeemed, releases
  its hold and captures what the order cost. A cost above the hold is
  captured up to the hold and the overage is debited to the team as an
  adjustment on the same gift; the recipient is never refused over money. The
  order placer is part of the commerce connector contract (`orders`) and the
  commercetools connector implements it (cart in the `gifting` store, vendor
  supply channel, `company-balance` payment). Per-address rate limits guard
  the recipient routes, and the request log records the route pattern, never
  the URL.
- **Why:** M4 is ours. The first version of this work used its own deposit and
  settlement model and was reworked onto the ledger (hold, release, capture).
- **Verified:** integration tests for one order and one capture under 20
  parallel claims, refusals (used, expired, unknown, bad address), sold-out
  and timeout recovery, orders over the hold, and the rate limit; unit tests
  for the order placer on a fake commercetools API.
- **Lessons:** a payment `interfaceId` must be unique per payment in
  commercetools (use the order number). The link secret is stored only as a
  hash, so a later delivery or resend mints a new link.

### Gift delivery by email (M3.4)
- **What:** sending a campaign emails each recipient a private link
  (`/r/<token>`; SMTP in dev, Mailpit locally). Delivery is claimed with an
  atomic `queued` to `sending` update, so a retry never sends twice. The
  sender can send a gift again (new link, old one stops) or cancel it (hold
  released); both are API routes for now. New: `@gifting/content` (every
  user-facing string) and the email channel adapter in `@gifting/channels`.
- **Why:** the email half of M3.4 is ours.
- **Verified:** integration tests for one email per recipient, no raw link
  stored, a failed email left retryable, resend and cancel, and scoping to the
  caller's team; unit tests for the email adapter and the strings.

### Marketplace catalog from commercetools (spike 2)
- **What:** the API can read the catalog from commercetools, as agreed in
  the [marketplace catalog plan](../plans/marketplace-catalog.md).
  - `@gifting/domain`: `ProductView` gains `key`, `imageUrl` and
    `variants`. New pure rules: `defaultVariant`, `withVariants`,
    `findVariant`, `variantName`. `collectionItems` now works per variant.
  - `@gifting/ct`: `catalog.ts` maps projections to product cards (price,
    stock at the vendor's channel, photos, variant labels, category and
    occasions from tags) and builds the collection search query.
    `catalog-reader.ts` makes the read-only calls. `loadCtApiConfig` reads
    the API's own client from `CTP_API_*`.
  - API: `ctCatalog` lists with a 60 s cache, resolves collections by
    search and reads a single SKU live. `CATALOG_SOURCE` chooses `seed` (the
    default) or `commercetools`. A single gift is priced from its variant.
    `pnpm --filter @gifting/api catalog:check` runs the real queries.
  - Sender app: product photos, "From $X" prices, an option picker in the
    product sheet and the send flow, and variant names on campaigns.
- **Why:** spike 2, and the project now holds the real catalog.
- **Verified:** unit tests (domain 42, ct 19, API 27); 33 integration
  tests. Break and restore on both stock checks. `catalog:check` shows that
  one search per collection finds exactly the reference set. The API was
  also checked live on commercetools on a second port.
- **Learned:** `isOnStock` without a channel finds nothing when every
  inventory entry is at a supply channel; use `isOnStockForChannel`. A
  comparison that re-filters its input proves nothing about the input.
  Details: [spike 2 results](../plans/spikes.md#spike-2-marketplace-catalog).

### Light for everyone
- **What:** the shared theme provider forces the light theme in every app.
  Before, it followed each device's light or dark setting.
- **Why:** teammates on dark-mode machines saw a navy app while others saw
  the light design. The prototype is light, and demos should look the same
  everywhere (Shivam). The dark tokens stay in `globals.css`, unused.
- **Verified:** with the device set to dark, the sign-in page renders light
  (no `dark` class, white background). Lint, typecheck and the build pass.

### Sender Home as an overview
- **What:**
  - Home keeps the prototype's features in the overview look Shivam
    shared ([plan](../plans/sender-home-redesign.md)):
    - four stat cards with the change against the previous period;
    - a daily activity chart and a status donut;
    - quick actions and a recent campaigns table;
    - the prototype's seven-item menu (three marked "Soon"), campaign
      search and an approvals bell.
  - **New API:** `GET /v1/teams/:teamKey/overview`, the `reporting`
    module's first route.
  - **Data:** gifts now record `statusAt`.
  - **Seed:** `pnpm seed:demo` adds 30 days of demo activity.
- **Why:** the team wanted the dashboard to look like a real gifting
  product, without adding features the prototype doesn't have.
- **Verified:**
  - 7 overview rule tests, 3 demo-activity tests, API scope tests and a
    guard check;
  - 32 integration tests;
  - 238 unit tests, lint, typecheck and the build;
  - the browser at desktop and phone widths, in light and dark.
- **Lessons:**
  - Never import a plain value from a `"use client"` module into a server
    page.
  - Chart entry animations can leave charts blank where animation frames
    are paused.
  - Check the palette for tokens that share a colour before mapping
    statuses to it.

### Branded account emails
- **What:**
  - `brandedEmail()` (`services/api/src/mail/layout.ts`): the wordmark, a
    card with a heading, a button and a copy-paste link, a note, a footer,
    a preheader and a plain-text version.
  - The verification email uses it.
  - Inline images (`cid:`) go over SMTP, and the outbox writes an `.html`
    preview.
- **Why:** the first verification email was a few bare paragraphs and a
  button, and looked unfinished in the inbox.
- **Verified:**
  - 5 layout tests: the link in both places, escaping, no first name, the
    logo attached as a real PNG, the preheader;
  - the preview at desktop and phone widths, with no sideways scrolling.
- **Lessons:** Gmail strips SVG and blocks `data:` images, so a logo in an
  email must be an inline attachment or hosted.

### Commerce connectors: the platform is a plug-in
- **What:**
  - The commerce platform became a connector
    ([ADR 0013](../architecture/decisions/0013-commerce-adapters.md),
    accepted; [plan](../plans/commerce-connectors.md)).
  - `@gifting/commerce` holds the contract and a conformance suite.
    `@gifting/commerce-commercetools` (moved out of the API) and
    `@gifting/commerce-memory` implement it.
  - `COMMERCE_CONNECTOR` picks one per deployment, from a list generated out
    of the API's dependencies.
  - The API now issues its own sessions and verification links; a
    platform's tokens travel sealed inside them.
  - A second sign-in mode, `hosted`, for platforms with their own sign-in
    page. `GET /v1/auth/options` tells the app which mode applies.
  - A lint rule keeps platform code inside connector packages.
- **Why:** the product will be sold to clients on Shopify, BigCommerce and
  others, and Shivam asked for plug and play from today: a new platform is a
  new connector and configuration, never a change to the product.
- **Verified:**
  - The conformance suite on memory (three modes) and on the real
    commercetools project.
  - 37 API tests, guard checks on sign-out, the newest link and the import
    rule.
  - Lint, typecheck, 190 tests and the build.
  - The hosted flow end to end in the browser, and the running API on
    commercetools.
- **Lessons:**
  - A Next.js server action redirecting to a URL on the same site is handled
    inside the app, so cookies set at the destination never reach the
    browser. Hand over to another page with a full page load.
  - A page that depends on the API's answer must render per request, or a
    build made while the API was down freezes it.

### Register and sign in with commercetools customer accounts (B2C)
- **What:**
  - Auth0 is replaced
    ([ADR 0015](../architecture/decisions/0015-commerce-customer-accounts.md),
    [plan](../plans/m1-register-sign-in.md)). Anyone can register,
    verify their email from a link, and sign in with commercetools' OAuth
    password flow.
  - The API hides the platform behind an `IdentityProvider`, sends the
    account emails itself, rate-limits, and refuses unverified accounts.
  - The sender app keeps the tokens in an encrypted http-only cookie and
    has register, verify and sign-in pages.
- **Why:** the product is B2C, a corporate gifting platform for one
  merchant, with accounts in the commerce platform.
- **Verified:**
  - 21 accounts tests, and a guard check on five guards.
  - Register, verify and the duplicate email, against the real project.
  - Lint, typecheck, 152 tests and the build.
  - Real sign-in waits for the sign-in API client.
- **Lessons:**
  - A password-flow token inherits its API client's scopes: with an admin
    client, every customer would hold full project access. Customer tokens
    need their own `manage_my_profile` client, enforced at start-up.
  - commercetools' password flow signs in unverified customers, so the
    application must check `isEmailVerified` itself.

### Real account emails through Brevo
- **What:** separate `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASS`
  settings, and Brevo's free plan for development email.
- **Why:** verification emails only reached `.data/outbox`, and nobody could
  test with a real inbox.
- **Verified:** an SMTP login check, then a verification email received in a
  personal inbox.
- **Lessons:** a sender's domain must be authenticated with the provider.
  `@royalcyber.com` (DMARC `p=quarantine`, no Brevo DKIM) was accepted by
  Brevo and then silently quarantined by the receiver.

### Sender dashboard merged with the commercetools catalog import
- **What:** `develop` (commercetools setup, Christie Cookie catalog, five
  demo companies) merged into the sender dashboard branch. In
  `infra/seed/src/index.ts` the products keep develop's descriptions and
  `perishable`, plus the dashboard's `category` and `occasions`.
  `demoCompanies` is develop's list of five; `demoCompany` is its first
  entry (Lumen Labs) with the dashboard's team thresholds, approvers and
  members added.
- **Why:** both branches changed the seed products and the demo company.
- **Verified:** lint, typecheck and unit tests after the merge; a new seed
  test checks that `demoCompany` keeps the same teams as `demoCompanies[0]`.

---

## 28 Oct 2026

### M1 sign-in, phase A: Auth0 sign-in and member access
- **What:**
  - **API:** checks Auth0 access tokens (`jose`, RS256, issuer, audience,
    expiry). Every route declares `auth: "member" | "ops" | "public"`.
    Members are found in commercetools by verified email, scoped to their
    company and teams, and returned by `GET /v1/me`.
  - **Sender app:**
    - `@auth0/nextjs-auth0` 4.32.0, with a `proxy.ts` that redirects to
      `/sign-in`;
    - a member-only route group with the account menu, and a no-access
      page;
    - the sign-in page in the prototype's look.
  - **`@gifting/ui`:** the prototype's colours, DM Sans and Sora.
  - **commercetools:** a `member-profile` type and company `emailDomains`.
  - `pnpm member:add`, and an Auth0 setup checklist in `infra/auth0`.
  - Details: the [plan's As built section](../plans/m1-sign-in.md#as-built).
- **Why:** sign-in is the base of every M1 to M7 flow, and the team needed
  the screens to match the prototype.
- **Verified:**
  - 31 API tests for every refusal, and a guard check on five guards.
  - The member queries ran against the commercetools project.
  - The built sender app's pages, at 390px and in light and dark.
  - A real sign-in waits for the Auth0 tenant.
- **Lessons:**
  - `next/font` variables must sit on `<html>`. On `<body>`, `--font-sans`
    (resolved on `:root`) silently falls back to the system font.
  - `defineRoute` called inline in an array infers its access mode from
    the array's type, not the default. Define routes as constants.
  - The Import API can't re-import a team unit that inherits its stores.

### Proposed: M1 sign-in plan; ADR 0009 accepted (Auth0)
- **What:** [M1: sign-in, invitations and member access](../plans/m1-sign-in.md),
  proposed:
  - Auth0 Free plan, with Google and email and password;
  - invite-only and work emails only;
  - members in commercetools Business Units;
  - the Gifting API decides access from the member record.

  ADR 0009 is accepted as Auth0, and open question 7 is answered.
- **Why:** sign-in is the base of every M1 to M7 flow. The prototype has no
  auth screens, so the plan sets them out in its look.

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

### commercetools holds everything the gifting flows need, except the subscription
- **What:**
  - `ct:apply` now creates more of the project:
    - the `standard` tax category (demo base rates for the 10 seeded
      states and a US fallback);
    - the US zone and a default $8.00 shipping method;
    - the `company-balance-payment` type;
    - `approverIds` on `team-settings`;
    - four gifting attributes on both product types: `perishable`,
      `shipsTo`, `leadTimeDays`, `minimumAge`;
    - the owner, admin, approver and sender associate roles;
    - a `gifts` category tree.

    It also links every vendor channel to the store, and adds missing
    fields and attributes to existing types instead of skipping them.
  - `pnpm seed` adds five fictional companies, each with two teams, as
    Business Units. The 250 demo customers are their associates: an owner
    and an admin per company, and an approver and senders per team. The
    fictional products gain descriptions, the tax category, gift
    categories and the gifting attributes.
  - `catalog:import` gives Christie Cookie products the tax category, the
    food-and-treats gift category, and perishable, ships-to-US and lead
    time.
- **Why:** so the spikes and M1 to M4 start from a project where a cart can
  be priced, and the commercetools setup can be handed off.
- **Verified:**
  - Import summaries: 289 of 289 operations for the seed and 742 of 742 for
    the catalog.
  - Read back: 15 units, 250 associates, 261 published products, every one
    taxed and in a gift category, and 5 supply channels on the store.
  - A test cart priced correctly: $57.00 item, $8.00 shipping and 7% TN tax
    make $69.55. It was deleted afterwards.

### Christie Cookie catalog and demo customers in commercetools
- **What:**
  - A new `infra/catalog` package.
    - `pnpm catalog:extract` reads the Christie Cookie storefront (with
      their written permission) into `.data/catalogs/christie-cookie.json`.
      `.data/` is gitignored.
    - `pnpm catalog:import` imports the snapshot, and `pnpm catalog:remove`
      deletes it all again.
  - The project now holds 249 Christie Cookie products (441 variants, 1,369
    images, USD prices), 51 of their categories under a `christie-cookie`
    root, and stock at a new `vendor-christie-cookie` channel.
  - A `cookie-tin` product type adds flavour, piece count, tin colour, item
    type and a corporate flag to the marketplace attributes.
  - `pnpm seed` also imports 250 fictional demo customers (`.example`
    emails, 555-01xx phones, US addresses, `ExternalAuth`).
  - `runImport` in `@gifting/ct/import` is shared by both imports.
  - CLAUDE.md now sets out the one exception to fictional demo data: the
    client's catalog, kept out of git.
  - Plan and results: [Christie Cookie catalog import](../plans/christie-catalog-import.md).
- **Why:** the demo shows the client's own tins and enough customers to
  try campaigns, alongside the fictional vendors.
- **Verified:**
  - Import summaries: 742 of 742 (catalog) and 274 of 274 (seed).
  - The read-back counts match: 249 products, 441 variants, every one with
    an image and a price, 441 stock entries, 52 categories, 250 customers.
  - Package tests, lint and typecheck pass.
- **Lessons:**
  - The storefront's Next.js flight payload carries the full product
    record, which is far richer than its schema.org data.
  - Some images have null alt text, and a strict schema dropped whole
    products. Make page parsers lenient on optional fields.
  - The Import API leaves a product `unresolved` until its category
    exists, so wait while the imported count still grows.
  - `pnpm import` is one of pnpm's own commands. Call a package script
    named `import` with `pnpm run import`.

### commercetools project set up and seeded
- **What:**
  - The POC project `corporate-gifting` (us-central1) is in use, with its
    credentials in the gitignored `.env`.
  - `pnpm ct:apply` created the `gifting` store, the four custom types, the
    `gift-item` product type and the four fictional vendor channels.
  - `pnpm seed` now imports through the Import API. It sends 12 products
    (published, USD price for the US, `brand`, `vendorKey` and `tags`
    attributes) and 12 stock entries at the vendor channels, then waits for
    the import summary. The mapping lives in `infra/seed/src/import.ts`, with
    tests.
  - `@gifting/ct/import` is a separate entry point for the Import API
    client, so the services don't bundle the Import SDK.
  - The drafts write text in `en-US`, the project's language, instead of
    `en`.
  - The setup guard accepts a project named exactly in
    `CTP_SETUP_PROJECT_KEY`, because the POC project's key has no `sandbox`
    or `dev`.
  - Proposed: [Christie Cookie catalog import](../plans/christie-catalog-import.md).
- **Why:** the spikes need a real project with vendors, products and stock.
- **Verified:**
  - Package checks: typecheck, lint and tests pass in `ct`, `ct-setup` and
    `seed`.
  - The import summary shows 24 of 24 operations imported.
  - Reading the project back gives 12 published products, prices in cents
    and 3 stock entries per vendor channel.
  - A second `ct:apply` skipped all 10 resources.
- **Lessons:** the project was created with the languages `en-US` and
  `de-DE`, so text keyed `en` would not match its locales. Check a new
  project's languages, countries and currencies before writing drafts.

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
