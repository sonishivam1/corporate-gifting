# 0012 — shadcn/ui as the one component library, in `@gifting/ui`

**Status:** Accepted (27 Oct 2026)

## Context

Four apps (sender, recipient, vendor, ops) are built by different people in
parallel. Without one component library, each would grow its own buttons,
tables and dialogs, and the POC would look like four products. We also want
accessible primitives (keyboard, focus, screen readers) without building
them, and a look that final branding can change through tokens.

## Decision

Use [shadcn/ui](https://ui.shadcn.com/) in its monorepo layout. Every
component in the registry is installed into `packages/ui` (style
`radix-nova`: Radix primitives, Lucide icons). Shared tokens and Tailwind
setup live in `packages/ui/src/styles/globals.css`. Apps import components by
path (`@gifting/ui/components/<name>`) and the stylesheet
(`@gifting/ui/globals.css`), and define no styles of their own. Components we
compose (app shell, gift status badge, theme provider) live beside the
shadcn ones.

## Consequences

- One look and one set of behaviours across all apps; branding is a token
  change in one file.
- shadcn components are source code we own: they can be changed, but changes
  are lost if a component is refreshed with `-o`, so prefer wrapping to
  editing.
- Installing everything adds dependencies apps may not use yet (charts,
  carousel, code highlighting). Next.js only bundles what a page imports, so
  pages stay small.
- The CLI writes new dependencies and helpers into the app it runs from; they
  must be moved to `packages/ui` by hand (see
  [design system](../../design/design-system.md#adding-or-updating-components)).
