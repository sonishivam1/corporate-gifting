# Sender dashboard: Home, Browse gifts, Campaigns and the send flow

**Status:** Built (not yet committed)
**Agreed:** 28 Oct 2026 · **Built:** 28 Oct 2026

## Goal

Turn the sender part of the [prototype](../design/gifting-prototype.html)
into a working `apps/sender`. It has three menu items (Home, Browse gifts,
Campaigns), and **Campaigns → New campaign** starts the four-step send flow.
Every screen reads from and writes to the Gifting API, so a sender can browse
the catalog, create a campaign, see the estimate and the approval or
short-balance outcome, and watch the campaign appear in the list with its
gifts. That gives us a demoable sender path early. It also pulls a thin
slice of M1 (balance), M2 (catalog read) and M3 (campaign create, estimate,
submit, approve) forward, built on the real module boundaries so the work
carries over.

## Scope

### Navigation and shell

| Menu | Route | From the prototype |
| --- | --- | --- |
| Home | `/` | `pageHome` |
| Browse gifts | `/browse` | `pageBrowse` |
| Campaigns | `/campaigns` | `pageCampaigns` |
| (no menu item) New campaign | `/campaigns/new` | `pageSend` (the "Send a gift" flow) |
| (no menu item) Campaign detail | `/campaigns/[id]` | `pageCampaign` |

- The sidebar is built from the shadcn `sidebar` component and composed once in
  `packages/ui` as `sidebar-shell.tsx`, so the other apps can reuse it. Its
  footer has the team switcher, **Available to send** and a disabled
  **Top up** button labelled M1.
- Send gifts, Collections, Automations and Budgets are left out of the menu.
- Every "Send" entry point in the prototype goes to `/campaigns/new`:
  - Home hero and tiles → `/campaigns/new`
  - Home "Your collections" card → `/campaigns/new?collection=<id>`
  - Browse product card **Send** → `/campaigns/new?sku=<sku>`
- The prototype's "New send" button becomes **New campaign**.

### Screens

**Home**
- Greeting, company and team, available balance, pending-approval count.
- Two quick-action tiles: Send a gift and Browse gifts. The Collections,
  Automate and Top up tiles are left out because those pages aren't in this
  step.
- Stats: available, held and spent, all computed from the ledger.
- "Your collections" strip (read-only platform collections), where clicking a
  card starts a campaign.
- "Recent campaigns": the four latest, with the % who chose a gift.
- The "Coming up" panel (birthdays and anniversaries) is left out until M5.

**Browse gifts**
- Filters for budget, occasion, category and search, held in URL search
  params so a filtered view can be shared and survives a reload.
- Product grid: brand, name, vendor and SLA, price, **Send**.
- A product detail sheet (`Sheet`) opens from the card.
- Empty state with **Clear filters**.

**Campaigns**
- Gift funnel across the team's campaigns: sent, opened, chose, shipped,
  delivered, expired.
- Tabs: All, Active, Scheduled, Needs approval (`?status=`).
- Table: name and type, status badge, gifts, chose %, spend, channels.
- **New campaign** button.

**Campaign detail**
- Header with type, gift, created date, channels and status.
- Stats: gifts, opened, chose, spent. Segment bar and legend.
- Gifts table: recipient, status (`GiftStatusBadge`), channel and chosen gift.
- If the campaign is pending approval and the viewer is the team's approver,
  **Approve** and **Decline** appear. The sender sees a "Waiting for
  <approver>" alert instead.

**New campaign (send flow).** A stepper with a live summary card ("What
they'll see" plus the hold) next to it.

1. **Gift.** Choose "Let them choose" (pick a budget chip of $25, $50, $75 or
   $100, then a collection; collections with nothing under that budget are
   disabled) or "One specific gift" (pick a product).
2. **Greeting.** Occasion, card design (4 covers), headline (40), from (40),
   message (500, with a counter).
3. **Recipients and delivery.**
   - Recipients: search the directory, select all, add by email.
   - Channels: any of the six. Email, SMS, Slack and Teams are recorded but
     not delivered in this step (see Decisions).
   - Send now or schedule a date.
   - Expiry of 30, 60 or 90 days, and a reminders switch.
4. **Review.**
   - Campaign name, with the default "<Occasion> · <date>".
   - Rows with **Edit** buttons that jump back to a step.
   - Cost block from the API estimate.
   - Alerts: *short* (red, submit disabled) and *needs approval* (amber, the
     button reads "Submit for approval").
5. **Done.**
   - Headline for the outcome: sent, scheduled or sent for approval.
   - If the link or QR channel was chosen: the gift link with **Copy**, a real
     QR code, and **Download links CSV**.
   - Buttons: **Track this campaign**, **Send another**.

Each step validates as in the prototype (`stepValid`), and the server
validates again.

### API (all under `/v1`, `defineRoute()` with Zod in and out)

| Method | Path | Module | Notes |
| --- | --- | --- | --- |
| GET | `/v1/me` | accounts | User, company, current team, role, teams they can switch to |
| GET | `/v1/teams/:teamKey/balance` | ledger | `{ availableCents, heldCents, spentCents, currency }` via `computeBalance()` |
| GET | `/v1/catalog/products?budget&occasion&category&q` | catalog | **New** (additive). Active vendor, in stock |
| GET | `/v1/collections?budget=` | catalog | Each with the count of items under the budget |
| GET | `/v1/collections/:id/items?budget=` | catalog | As planned in [API](../technical/api.md) |
| GET | `/v1/recipients?q=` | recipients | Directory search (read-only demo directory until M5) |
| GET, POST | `/v1/campaigns` | campaigns | List with per-campaign counts and funnel totals; create draft |
| GET | `/v1/campaigns/:id` | campaigns | Detail |
| POST | `/v1/campaigns/:id/estimate` | campaigns | Gifts × per-gift hold, available, after, `needsApproval`, `short` |
| POST | `/v1/campaigns/:id/submit` | campaigns | See the submit rules below |
| POST | `/v1/campaigns/:id/approve`, `/decline` | campaigns | Approver only, and the approver must not be the sender |
| GET | `/v1/campaigns/:id/gifts` | gifts | Gift rows for the detail table |
| GET | `/v1/campaigns/:id/links.csv` | channels | Gift links. Tokens are returned only here and only once per gift |

**Submit rules for `POST /v1/campaigns/:id/submit`.** The outcome depends on
the estimate:

- **Over the team threshold:** the campaign becomes `pending_approval`. No
  holds are placed.
- **Short of funds:** the API returns `409 insufficient_funds` and nothing is
  written.
- **Otherwise:** in one transaction, the API creates one gift per recipient
  and one `hold` entry per gift, and moves the gifts to `sent` (or
  `scheduled` for a later send date).

The company and team always come from the session. Anything outside them is
a 404.

### Domain and data

- **Campaign model (additive).** Add `greeting { occasion, cover, headline,
  fromName }` and `reminders: boolean`. `message`, `channels`, `sendAt` and
  `expiresInDays` already exist. The prototype's "scheduled" campaign is
  `approved` with a future `sendAt` and is only *displayed* as "Scheduled".
- **Pure rules in `@gifting/domain`, with tests:**
  - `perGiftHoldCents(campaign, price)`
  - `estimateCampaign()`
  - `needsApproval(total, threshold)`
  - `campaignFunnel(gifts)`, which counts gifts by stage, as in the
    prototype's `counts()`
- **Seed data (`infra/seed`).**
  - Products gain `category`, `occasions` and `description`, the fields
    Browse filters on.
  - Add the five prototype collections, the demo directory (16 fictional
    people at `lumenlabs.example`), the two teams' thresholds and approvers,
    and opening top-ups.
  - Everything stays fictional.
- **Demo seeding:** a `pnpm seed:demo` script writes the accounts, top-ups,
  collections and directory to local MongoDB. It is idempotent: top-ups use
  `ledgerKeys`, so a second run writes nothing.

### Local development

- **`pnpm dev:all`** runs `pnpm db:up && pnpm seed:demo && pnpm dev`, so
  one command starts everything with demo data. `seed:demo` ensures the
  indexes and writes nothing new on a repeat run. Plain `pnpm dev` stays free of Docker for UI-only work, and
  `pnpm build` still never needs a database.
- **Startup check in the API.** If MongoDB can't be reached, the API logs
  "MongoDB is not reachable at <host>; run pnpm db:up" and keeps serving
  `/health`, instead of failing later with a confusing error. The log line
  has only the host, never the full connection string.

### Not in scope

Real delivery for email, SMS, Slack and Teams (M3.4 and M5), the scheduled-send
worker, reminders actually firing, gift actions (Remind, Extend, Cancel),
CSV recipient upload, the Collections, Automations and Budgets pages, top-ups
and Stripe, the recipient app and redemption, and real sign-in.

## Decisions (agreed 28 Oct 2026)

1. **Data lives in MongoDB.** Platform data (campaigns, gifts, recipients,
   accounts, ledger entries, collections) goes through each module's repo.
   The catalog is read from a **seed-backed `CatalogSource` adapter**, which
   stands in for commercetools until package 0.3 imports the seed and M2
   switches it to product search. Products are never copied into MongoDB.
   Locally this is the free Atlas Local container (`pnpm db:up`); no paid
   database is needed for this step.
2. **No sign-in.** There is no sign-in screen. The API builds the session
   from a fixed demo user (Maya Chen, sender, Lumen Labs), and only when
   `DEV_AUTH=1` and `NODE_ENV !== "production"`.
   - Approval needs someone other than the sender. A "Viewing as" select in
     the sidebar footer switches to the team's approver (Rowan Ellis for
     People, Imani Brooks for Sales) through a `gifting_dev_user` cookie,
     with no password.
   - The team switcher changes the session's team, never a request body
     field.
   - This session code sits in one place, which M1 replaces with the
     identity provider (ADR 0009).
3. **Holds; shipping and tax stay open.** Per-gift hold = the collection
   budget, or the product's price for a single gift, with shipping, tax and
   fee at 0. The amount goes through `holdAmount()`, so the answers to the
   [open questions](../business/open-questions.md) slot in later without
   changing the flow. The review step doesn't claim that shipping or tax is
   included.
4. **No delivery yet.** Gifts move to `sent` and get a `queued`
   notification, but no adapter sends anything. Links and QR codes work
   because they need no provider.
5. **How the app calls the API.** Server components fetch through
   `lib/api.ts` (server-only, forwarding the session cookie). The send flow
   keeps its state on the client in one component and submits through
   Server Actions. No API URL or credential reaches the browser.
6. **QR codes.** Add a `qr-code.tsx` component to `packages/ui` using the
   `qrcode` package, replacing the prototype's illustrative canvas.
7. **Tests.** Database tests use throwaway `gifting_test_*` databases behind
   `assertTestDb()`. CI has no MongoDB today, so this step adds a MongoDB
   service container to the CI job, which pulls M1.5 forward. The pure rules
   and route validation stay plain unit tests. The service container is the
   free `mongodb/mongodb-atlas-local` image, the same one `pnpm db:up` uses,
   so transactions work. It runs on the GitHub Actions minutes the repo
   already uses; nothing new to pay for.
8. **Plan change.** This step runs ahead of the spikes and M1. It is recorded
   as change 1 under "Changes after agreement" in the [POC plan](poc-plan.md).

## Build order

1. Domain: campaign fields and the estimate, approval and funnel rules,
   with tests.
2. Seed data and `pnpm seed:demo`. Dev session plugin in the API.
   `pnpm dev:all` and the API's MongoDB startup check.
3. API: me and balance, then catalog and collections, recipients, and
   campaigns (create, estimate, submit, approve, decline), gifts and links.
   Tests use `app.inject()`.
4. UI: `sidebar-shell` and `qr-code` in `packages/ui`, then the pages in this
   order: Home, Browse, Campaigns, Campaign detail, New campaign.
5. Refusal tests, the break-and-restore check, then lint, typecheck, test
   and build.
6. Docs and the build log.

## Tests

- **Rules:** estimate (collection vs single), the threshold boundary
  (equal is not over), short by 1 cent, and funnel counts.
- **What must be refused:**
  - Another company's campaign → 404.
  - Another team's campaign → 404.
  - Submit when short → 409, with no gifts and no ledger entries.
  - A second submit → no new gifts or holds (idempotency keys).
  - The sender approving their own campaign → 403.
  - A non-approver approving → 404.
  - A SKU over the budget, or an inactive or out-of-stock item, in a
    single-gift campaign → 422.
  - Price or `teamKey` in the request body → ignored or rejected.
- **Money:** after submit, `computeBalance()` shows held = gifts × hold.
  Status and holds are written in one transaction. If the transaction aborts
  partway, nothing is written.
- **Break and restore:** remove the `teamKey` filter from the campaigns repo
  and watch the cross-team test fail.
- **UI:** each step blocks Continue until valid. Review shows the short and
  approval alerts. Pages work at phone width.

## Docs to update

- [features.md](../product/features.md): capabilities 3, 10 and 12, and
  the sender app status.
- [data-model.md](../architecture/data-model.md): the campaign fields.
- [api.md](../technical/api.md): the routes above move to Built, including
  `/v1/catalog/products`.
- The README progress table.
- The commands table in [CLAUDE.md](../../CLAUDE.md): `pnpm dev:all` and
  `pnpm seed:demo`.
- [roadmap.md](../product/roadmap.md): "Last updated".
- The [POC plan](poc-plan.md) change log.
- The build log, and a CHANGELOG line.

## As built

**Changes from the plan**
- **Teams, thresholds, approvers and members** come from a seed-backed
  `OrgDirectory` (`services/api/src/modules/accounts/org.ts`), not MongoDB.
  In commercetools they are Business Units, the `team-settings` type and
  Associates, so M1 swaps the source, as with the `CatalogSource`.
- **No `links.csv` endpoint.** Only token hashes are stored, so links can
  be shown once only. The submit response returns them and the Done screen
  offers a CSV download. `decline` and `approve` return no links.
- **Gifts are created at submit**, also for campaigns that need approval
  (`pending_approval`, `holdNo` 0, no holds). Approval moves them to `sent`
  or `scheduled` and places the holds. This uses the existing gift state
  machine, and the sender gets links straight away.
- **An unsaved estimate route**, `POST /v1/campaigns/estimate`, prices the
  review step without saving drafts. The app saves and submits only on
  Send, with an idempotency key per open flow.
- **Self-approval:** the plan's 403 applies when an approver approves their
  own campaign. A sender who isn't an approver gets 404, like any other
  out-of-scope caller.
- **Account lock:** `accounts.holdsUpdatedAt` is touched in every hold
  transaction, so concurrent holds on one team conflict and retry against
  the new balance.
- **Docker:** `docker-compose.yml` now pins `hostname: gifting-mongo`
  (see Lessons).

- **"Let them choose" hidden (28 Oct, after review).** The send flow offers
  only "One specific gift", and Home no longer shows the collections strip,
  which led into that option. One flag, `LET_THEM_CHOOSE` in
  `apps/sender/lib/features.ts`, controls both. The API and the collection
  code are unchanged, so turning it back on is a UI change only.

**Verification**
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (twice) and `pnpm build`:
  pass on 28 Oct 2026.
- `pnpm test:integration`: 29 tests pass against throwaway databases on
  the local Atlas Local (28 Oct 2026).
- Break and restore, each restored afterwards:
  - Dropping the `teamKey` filter from the campaigns `find` fails "another
    team's campaign" and "another team's approver".
  - Removing the account lock (`holdsUpdatedAt`) fails "only one of two
    racing sends spends the last of the budget".
  - Disabling the balance check in `placeHolds` failed nothing at first:
    `submit` re-checks inside its transaction, but `approve` relies on
    `placeHolds` alone. Added "refuses to approve and changes nothing" when
    the budget has run down, which now fails without the check.
- Pages checked against the running app with the seeded demo data: Home,
  Browse (with filters), Campaigns (with tabs), New campaign (plain, from a
  SKU, from a collection), and 404 for an unknown campaign.

**Lessons**
- Atlas Local keeps the hostname in its replica set config. Without a fixed
  `hostname`, a recreated container panics with `ReplicaSetNoPrimary`.
- Atlas Local reports healthy before it has a primary, so wait for
  `isWritablePrimary` before writing.
- In Next.js, read `cookies()` outside any catch-all `try`.
