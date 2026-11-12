# Design system

**Status:** Built: the component library. All four apps use
[shadcn/ui](https://ui.shadcn.com/) components from `@gifting/ui`
([ADR 0012](../architecture/decisions/0012-shadcn-ui.md)). Visual design
stays minimal in the POC; final branding is handled separately and lands as
token changes, not new components.

## The rule

**Every app builds its UI from `@gifting/ui`.** If a pattern isn't there:

1. Add the shadcn component (below) if one exists.
2. Otherwise compose one in `packages/ui/src/components/` from shadcn parts
   (like `app-shell.tsx` and `gift-status-badge.tsx`).
3. Only then write app-local markup, and only for one-off page layout.

No app defines its own colours, fonts or component styles.

## Setup

shadcn's [monorepo layout](https://ui.shadcn.com/docs/monorepo), with style
`radix-nova` (Radix primitives, Nova preset, Lucide icons, neutral base
colour).

| Where | What |
| --- | --- |
| `packages/ui/components.json` | shadcn config for the library; aliases `@gifting/ui/components`, `/lib`, `/hooks` |
| `packages/ui/src/components/*.tsx` | Every shadcn component, plus our composed ones |
| `packages/ui/src/hooks/*.ts` | `use-mobile`, `use-highlighted-code` |
| `packages/ui/src/lib/` | `utils.ts` (`cn`), `highlighter.tsx` |
| `packages/ui/src/styles/globals.css` | Tailwind 4, shadcn tokens (light; a dark set kept but unused), base styles; `@source` covers every app |
| `apps/*/components.json` | Points the CLI at `packages/ui` |
| `apps/*/postcss.config.mjs` | Re-exports `@gifting/ui/postcss.config` |
| `apps/*/app/layout.tsx` | Imports `@gifting/ui/globals.css`; wraps pages in `ThemeProvider` and `TooltipProvider`; renders `Toaster` |

Import components by path:

```tsx
import { Button } from "@gifting/ui/components/button";
import { Card, CardHeader, CardTitle } from "@gifting/ui/components/card";
import { cn } from "@gifting/ui/lib/utils";
```

## Adding or updating components

Run the CLI **from an app folder**, never from `packages/ui`:

```bash
cd apps/sender
pnpm dlx shadcn@4.23.0 add <component>          # or --all -o to refresh everything
```

The CLI writes components into `packages/ui`. Two things to check afterwards
(see the gotchas in [CLAUDE.md](../../CLAUDE.md#gotchas)):

- It adds new npm dependencies to the **app's** `package.json`: move them to
  `packages/ui/package.json`.
- Hooks and lib helpers land in the app's `hooks/` and `lib/`: move them to
  `packages/ui/src/hooks` and `src/lib`, and change `@/hooks/…` imports to
  `@gifting/ui/hooks/…`.

Generated component files keep shadcn's own code style (no semicolons), so
they can be refreshed with `-o` without a diff full of formatting. Our
composed components follow the repo's style.

## Components

All 63 components in the registry, installed 27 Oct 2026 with
shadcn 4.23.0:

accordion · alert · alert-dialog · aspect-ratio · attachment · avatar · badge
· breadcrumb · bubble · button · button-group · calendar · card · carousel ·
chart · checkbox · code-block · collapsible · combobox · command ·
context-menu · dialog · direction · drawer · dropdown-menu · empty · field ·
hover-card · input · input-group · input-otp · item · kbd · label · marker ·
menubar · message · message-scroller · native-select · navigation-menu ·
pagination · popover · progress · questionnaire · radio-group · resizable ·
scroll-area · select · separator · sheet · sidebar · skeleton · slider ·
sonner · spinner · switch · table · tabs · textarea · toggle · toggle-group ·
tooltip · trace

Ours, built on them:

| Component | Use |
| --- | --- |
| `app-shell` | Page frame: product and app name, title |
| `gift-status-badge` | A gift's status in the tone below |
| `theme-provider` | Light for everyone (next-themes with `forcedTheme="light"`), whatever the device's setting. The dark tokens stay in the stylesheet, turned off |

## Likely use per app

| App | Main components |
| --- | --- |
| Sender dashboard | sidebar, table, data filters (select, combobox, calendar), dialog, sheet, field, chart, badge, sonner |
| Recipient experience | card, carousel, radio-group, field, input, button, progress, empty; phone first (390px) |
| Vendor portal-lite | table, dialog (mark shipped), field, badge, dropdown-menu |
| Ops admin | table, tabs, dialog, alert-dialog (refunds and adjustments), field, command |

## Tokens and branding

- Tokens are shadcn's CSS variables (`--background`, `--foreground`,
  `--primary`, `--muted`, `--border`, `--radius`, …) in
  `packages/ui/src/styles/globals.css`, with a `.dark` set. Use the Tailwind
  names (`bg-background`, `text-muted-foreground`, `bg-primary`), never raw
  colours.
- The palette is the prototype's (28 Oct 2026): navy text `#012754`, blue
  actions `#2570C5`, soft blue-grey surfaces, with a derived navy set for
  dark mode. Beyond shadcn's tokens there are status tones (`success`,
  `warning`, `info`, each with a `-soft` background) used by the status
  badges, and one `tile-<category>` pair per catalog category for product
  art.
- DM Sans for text (`font-sans`) and Sora for headings (`font-heading`,
  applied to `h1` to `h3`). Both are self-hosted with `next/font/local` from
  the font files in `packages/ui/src/fonts` (latin subset, variable weight,
  SIL Open Font License), so the build never calls Google Fonts
  (`@gifting/ui/lib/fonts`). Each app's root layout puts `fontVariables` on
  `<html>`, where `--font-sans` is resolved; on `<body>` the fonts silently
  fall back to the system stack.
- Shared account pieces:
  - `AuthCard`: the wordmark over one card, for the register, sign-in
    and email pages;
  - `PasswordInput`: show/hide button and Caps Lock warning;
  - `Checklist`: live rules, with met items in `text-success`;
  - `UserMenu`: sign-out is a form post;
  - the `Wordmark`.

  `AppShell` and `SidebarShell` take header `actions` (the dashboard puts
  the `UserMenu` there). `SidebarShell` also has a `topBar` slot (search),
  and nav items can be `soon` (shown with a badge, not a link). Its menu
  uses 40px rows, 18px icons and a primary-tinted active item under a
  "Menu" heading. The page uses wide screens up to 1600px.
- Overview pieces:
  - `StatCard`: an icon in a soft tone, a label, a value, the change
    against the previous period, and an optional footer;
  - `GiftActivityChart` and `GiftStatusDonut`, built on the shadcn `chart`
    component.

  Each gift status has one colour: waiting slate, opened amber, chose
  blue, shipped purple, delivered green, expired red. The activity chart
  uses the same colours. Charts don't animate in.
- The recipient app sets `--primary` (and `--primary-foreground`) from the
  company's `brandColor` (Business Unit `company-settings`) and shows its
  `logoUrl` in the header. If the brand colour fails contrast, the default
  `--primary` stays.

## Emails

Emails can't use the component library, so they have their own layout in
`services/api/src/mail/layout.ts` (`brandedEmail()`), with the same palette:
- the wordmark (the gift icon as an inline PNG, `cid:`; email clients strip
  SVG and block `data:` images), then one white card with a heading,
  paragraphs, a button and a copy-paste link, a note, and a footer;
- tables and inline styles only, light only (`color-scheme`), a hidden
  preheader for the inbox preview line, and a plain-text version;
- every account email uses it. Outside production the outbox writes an
  `.html` preview next to each `.eml`, to see the design without sending.

## Gift status colours

| Status | Tone |
| --- | --- |
| created, scheduled, pending approval | neutral |
| sent, opened | info |
| redeeming | warning |
| redeemed, shipped, delivered | success |
| expired, cancelled | muted |

## Accessibility

- Radix primitives give keyboard and screen-reader behaviour; don't replace
  them with plain `div`s.
- Every form field uses `Field` and `Label`; errors are announced.
- Contrast at least 4.5:1, including with a company's brand colour.
- Every page works at 390px wide without sideways scrolling.
