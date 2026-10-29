# Sender Home: the prototype's features, in the overview look

**Status:** Built
**Agreed:** 29 Oct 2026 (Shivam) · **Built:** 29 Oct 2026

## Goal

Redesign the sender app's Home and its frame. The look comes from the
overview mockup Shivam shared on 29 Oct 2026: stat cards with trends,
activity charts, a status breakdown, a clean table and a top bar.

The **features stay the prototype's** ([gifting-prototype.html](../design/gifting-prototype.html),
`pageHome`), and the menu stays the prototype's too. The mockup's other
menu items (Gift Cards & Points, Employees, Integrations, Reports), its
company switcher and its rupee amounts are not part of this.

Background: the [dashboard research](../product/dashboard-research.md) and
the [sender dashboard plan](sender-dashboard.md) that built today's Home.

## Scope

### The frame (every sender page)

| Part | What |
| --- | --- |
| Sidebar | The prototype's menu, in its order: Home, Send gifts, Browse gifts, Collections, Campaigns, Automations, Budgets. Send gifts opens the send flow (`/campaigns/new`). Collections, Automations and Budgets aren't built yet: they show with a "Soon" badge and aren't links. The team switcher, **Available to send** and **Top up** (still disabled) stay in the footer |
| Top bar | **Search campaigns** (opens Campaigns filtered by name), a **bell** showing the sends waiting for approval, and the account menu with sign-out |

### Home (`/`), section by section

| Prototype Home | Shown the overview way |
| --- | --- |
| Greeting, team, "You have $X to give", pending approvals | Page header: "Good afternoon, {first name}", the team, the **date range** (7, 30 or 90 days; default 30; kept in the URL) and **Send a gift** as the main button, with **Browse gifts** beside it |
| Available, held, spent | **Stat card 1, Available to send:** the amount, with a bar of how much of the funded total is held or spent, and the held and spent amounts underneath. It shows the balance now, whatever the date range |
| Funnel (on the prototype's Campaigns page) | **Stat card 2, Gifts sent** in the range, with the change against the previous range. **Stat card 3, Chose a gift**: the count and the rate (chose ÷ sent), with the change in points. **Stat card 4, Expiring soon**: gifts not yet chosen whose link expires in the next 7 days |
| (none) | **Gift activity** chart: sent, opened and chose a gift, per day over the range |
| (none) | **Gift status** donut with a legend: waiting (sent, not opened), opened, chose a gift, shipped, delivered, expired. The total sits in the middle |
| Quick tiles: Send, Browse, Build a collection, Automate, Top up | Compact action cards in one row. The ones that aren't built yet (Build a collection, Automate, Top up) show "Soon" |
| Your collections | Kept: a scrolling row of collection cards; clicking one starts a send with it |
| Recent campaigns | A table in the overview style: name and type, status badge, gifts, chose a gift (bar and %), **View**. "View all" goes to Campaigns |
| Coming up (birthdays, anniversaries) | Left out until Automations (M5), as now |

The words are the prototype's: "Chose a gift", not "Claimed"; "Campaigns",
not "Gift Campaigns".

### API

`GET /v1/teams/:teamKey/overview?range=7d|30d|90d` (a workspace route, like
the balance), returning:

| Field | Meaning |
| --- | --- |
| `range` | `{ from, to }` and the previous period's `{ from, to }` |
| `balance` | Available, held, spent (from `@gifting/ledger`) |
| `sent`, `chose` | `{ count, previous }` for the range and the previous range |
| `expiringSoon` | Gifts in `sent` or `opened` whose `expiresAt` is within 7 days |
| `pendingApprovals` | Campaigns waiting for approval in this team |
| `daily` | `[{ date, sent, opened, chose }]`, one row per day in the range |
| `statuses` | Counts for waiting, opened, chose, shipped, delivered, expired |

- **Scope:** another team's overview is `404`, like the balance.
- **Pure rule:** the counting is a pure function in `@gifting/domain`
  (`overviewFrom(gifts, range, now)`). The route only reads and passes the
  gifts in.

### Data

- **Gift dates:** a gift records when it was created, updated and expires,
  but not when it was sent, opened or chosen. Add `statusAt`: the time each
  status was reached (`sent`, `opened`, `redeeming`, `shipped`,
  `delivered`, `expired`).
  - It's additive and optional, so existing gifts still parse.
  - It's written in the same transaction as each status change, through
    `canTransition()`.
- **Index:** add `{ teamKey: 1, "statusAt.sent": 1 }` for date-range
  queries. It starts with `teamKey`, as member-lookup indexes must.
- **Demo data:** `pnpm seed:demo` gives its gifts `statusAt` dates spread
  over the last 30 days, so the chart has a shape. It also needs a way to
  rewrite demo data that already exists (today it skips it).

### Components (`@gifting/ui`)

- `stat-card.tsx`: icon, label, value, a change with an up or down arrow,
  and an optional bar or footer line.
- `SidebarShell` gains a top-bar slot for search and the bell (it already
  has `actions` for the account menu).
- The chart and donut use the shadcn `chart` component (Recharts, already
  installed), coloured with the `--chart-*` and status tokens.

### Not in scope

- Restyling Browse, Campaigns and campaign detail; they come next, in the
  same look.
- Collections, Automations and Budgets pages, top-ups, gift actions (remind,
  extend, cancel), CSV reports.
- Everything in the mockup that isn't in the prototype: gift cards and
  points, employees, integrations, reports, a company switcher, rupees.

## Decisions

1. **The prototype decides the features; the mockup decides the look.**
   Anything in the mockup that the prototype doesn't have is left out.
2. **Our design system, not the mockup's colours:** navy and blue tokens,
   the prototype's fonts, light and dark, built from shadcn components.
3. **The balance card ignores the date range;** the other three cards and
   the charts follow it. Changes compare with the previous period of the
   same length.
4. **"Expiring soon" means the next 7 days,** for gifts nobody has chosen
   yet.
5. **Unbuilt menu items show "Soon"** rather than hiding, so the menu
   matches the prototype from now on.
6. **Fictional demo data only**, with `.example` addresses.
7. **USD stays** until the currency decision is made.
8. **This ships with the branded emails** on `feat/branded-emails`, as one
   pull request.

## Tests

- **Pure rule** (`overviewFrom`):
  - range edges and the previous period;
  - the rate when nothing was sent;
  - the 7-day expiry window;
  - status grouping;
  - days with no activity still appear in `daily`.
- **API through `app.inject()`:**
  - another team's overview is `404`;
  - an unknown range is `400`;
  - workspace routes are refused without `DEV_AUTH`.
- **Integration** (MongoDB): the numbers match the seeded gifts; a status
  change writes `statusAt` in the same transaction.
- **Guard check:** drop the team filter, watch the scope test fail, restore
  it.
- **In the browser:**
  - at 1280px and 390px, light and dark;
  - the range switch updates the cards and charts;
  - the empty state (a team with no gifts).

## Docs to update

- [features.md](../product/features.md)
- [api.md](../technical/api.md) (the overview route)
- [data-model.md](../architecture/data-model.md) (`statusAt`, the index)
- [design-system.md](../design/design-system.md) (`StatCard`, charts, the
  top bar)
- the roadmap, the build log, and this plan's **As built**.

## As built

**Domain and data:**
- `@gifting/domain`:
  - `overview.ts`: `overviewFrom()`, `overviewWindow()`, `OVERVIEW_RANGES` and `overviewView`;
  - `gift.statusAt`, optional dates per status.
- **Writers:** the gifts service writes `statusAt` when it creates gifts
  and in `moveCampaignGifts` (approval). Both are in the caller's
  transaction.
- **Index:** `{ teamKey: 1, "statusAt.sent": 1 }` on `gifts`.
- **Seed:** `infra/seed/src/write-activity.ts` writes 8 demo campaigns (63
  gifts) over the last 30 days for both demo teams, with ledger holds,
  captures and releases. Only `pnpm seed:demo` runs it; the integration
  tests start from no activity.

**API:**
- `GET /v1/teams/:teamKey/overview?range=7d|30d|90d` in the `reporting`
  module (its first route).
- It reads through the gifts, ledger and campaigns services, using
  `forOverview()` and `pendingApprovalCount()`.

**UI (`@gifting/ui`):**
- `StatCard`, `GiftActivityChart`, `GiftStatusDonut`;
- `SidebarShell` items can be `soon` or have `excludes`, and the header has
  a `topBar` slot and sticks to the top.

**Sender app:**
- **Shell:** the prototype's menu, campaign search (`/campaigns?q=`), and
  an approvals bell.
- **Home:** rebuilt as planned. The date range is a `Select` that keeps
  `?range=` in the URL.

**Changes from the plan:**
- **Greeting:** Home greets the signed-in person's first name. It falls
  back to the workspace's development user only when the name is missing.
- **Colours:** each status has its own token. The light palette has `info`
  equal to `chart-1` and `chart-2` close to `success`, so Shipped uses the
  purple product-tile token. The activity chart shares the donut's colours.
- **Animation:** the charts don't animate in. Recharts' animation needs
  `requestAnimationFrame`, which background tabs and previews pause, and
  then the charts stayed empty.
- **Seeding again:** demo activity is never rewritten, because the ledger
  is append-only, even for demo data. To move it to today, drop the local
  database and seed again ([getting started](../engineering/getting-started.md)).

**Verified:**
- 7 tests for `overviewFrom`:
  - range edges and the previous period;
  - the rate when nothing was sent;
  - days with no activity;
  - the expiry window;
  - status grouping;
  - older gifts without dates.
- 3 tests for the demo activity: no future dates, stage order allowed by
  the gift state machine, every stage covered.
- **API:**
  - another team's overview is `404`, an unknown range `400`, and it's
    refused without `DEV_AUTH`;
  - guard check: removing the team check fails the scope test.
- **Integration (MongoDB):**
  - an empty overview, then a sent campaign counted and dated;
  - a send waiting for approval shows on the bell, and its gifts are
    counted once approved;
  - 32 integration tests in all.
- **Repo:** lint, typecheck, 238 unit tests and the build.
- **In the browser,** with the built app and the seeded demo activity:
  - 1440px and 390px, light and dark, with no sideways scrolling;
  - the range switch updates the cards (7 days: 17 sent, up 113%);
  - search finds a campaign;
  - "Send gifts" is highlighted on the send flow;
  - Collections, Automations and Budgets show "Soon".
- **Not checked:** the empty state in the browser (both demo teams have
  activity). Its rule is tested.

**Follow-up (29 Oct 2026, from Shivam's review):**
- The page now uses wide screens up to 1600px instead of about 1150px,
  which had left large empty margins.
- **Sidebar:**
  - a "Menu" heading;
  - roomier rows with a tinted active item;
  - "Soon" as bordered pills;
  - the team, balance and Top up in one card;
  - the development "Viewing as" picker set apart.
- The donut legend no longer wraps.

**What we learned:**
- A server page that imports a plain value from a `"use client"` module
  gets a client reference, which is `undefined` on the server. Shared
  constants go in `lib/`.
- Rendered on a server, chart entry animations can leave a chart blank
  wherever animation frames are paused.
