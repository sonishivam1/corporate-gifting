# Build-your-own collection (M2.3)

**Status:** Built (not yet committed)
**Agreed:** 2 Nov 2026 · **Built:** 2 Nov 2026

## Goal
Let a company build its own gift collections from the live catalog, by tags
and brands and by picking individual products, and reuse them in any
campaign. This is the last package of M2 (exit: "a sender builds a
collection by tag and brand"). It also answers "several gifts, the recipient
picks one": a collection of hand-picked products is exactly that, and
campaigns, estimates, holds and redemption already work with collections, so
no money rule changes.

## Scope

| Area | What gets built |
| --- | --- |
| Domain (`packages/domain`) | `collectionInput` (name, budget band, rules) and its checks; `archivedAt` on `giftCollection` (optional, so existing documents stay valid); a rule that a company collection has at least one tag, brand or SKU, since empty rules match the whole catalog |
| API (catalog module) | `POST /v1/collections` (create), `PATCH /v1/collections/:id` (rename, change rules or band), `POST /v1/collections/:id/archive`. `GET /v1/collections` lists platform and company collections, without archived ones. All scoped to the caller's company |
| Sender app | A **Collections** page: the company's collections and the platform's. A **Build a collection** screen: search and filter the live catalog, add tags and brands, tick products, see what fits a budget, name it and save. Edit and archive from the list |
| Send flow | "Pick a collection" lists company collections first. A "Build one" link opens the builder and returns with it chosen |
| Not in scope | Per-team or private collections; approving collections; countries other than the US; copying a platform collection; "recipient gets every gift"; per-person different gifts |

## Decisions

1. **Shared with the whole company.** A collection belongs to the company
   (`owner: companyKey`). Every member who can send can see, use, edit and
   archive it. Who created and last changed it is recorded (`createdBy`,
   `updatedBy`).
2. **Saved for reuse.** A collection is built once and used in any later
   campaign, by anyone in the company.
3. **Rules and picks together.** A collection holds tags, brands and picked
   products. An item is in the collection when it matches any of them (the
   rule `matchesRules` already uses). Picking a product adds the SKUs of its
   variants. The per-gift budget still decides which variants a recipient
   sees, and stock is re-read live, as today.
4. **Archive, never delete.** A recipient reads the collection when they
   choose their gift, possibly weeks after it was sent. Archiving hides a
   collection from lists and new campaigns, but gifts already sent still
   resolve it. Archiving is refused for platform collections.
5. **Edits apply to gifts not yet redeemed.** Recipients see the
   collection as it is when they open it, the same as platform collections
   today. Money is safe: each gift's budget was held when it was sent, and
   items over that budget never show. The edit screen says so.
6. **No new MongoDB collection.** It uses `collections`; the
   `{owner, name}` index already covers the company lists. Names are unique
   within a company among active collections (checked in the service,
   `409 collection_name_taken`).
7. **Scope from the session.** The company comes from the session, never
   the body. Another company's collection, or a platform one being edited or
   archived, is "not found" (404).
8. **Limits.** A name of 1 to 120 characters; up to 20 tags, 20 brands and
   200 SKUs; a budget band from $5 to $500. A collection with nothing in
   stock at its band can be saved (stock changes), but the builder warns.

## Tests

- **Domain:** input checks (empty rules refused, limits); `collectionItems`
  with picked SKUs, tags and brands together.
- **API through `app.inject()`:**
  - create, list (company first, archived hidden), edit, archive;
  - a campaign sent from a company collection estimates, holds and is
    redeemed for a picked product;
  - a gift sent before its collection is archived can still be redeemed;
  - an out-of-stock or over-budget picked item never shows to the
    recipient.
- **Refusals:**
  - another company's collection is "not found" to list, use, edit or
    archive, whatever the body says;
  - a platform collection can't be edited or archived;
  - an archived collection can't start a new campaign;
  - empty rules, an over-long name and a duplicate name are refused, and
    nothing is written.
- **Break and restore:** drop the `owner` filter from edit; the
  other-company test fails.

## Docs to update

`docs/product/features.md` (feature 9), `docs/technical/api.md`,
`docs/architecture/data-model.md` (`archivedAt`, `createdBy`, `updatedBy`),
`docs/product/roadmap.md`, the README progress table, this plan's **As
built**, `docs/plans/README.md`, `docs/engineering/build-log.md` and
`CHANGELOG.md`.

## As built

Built on 2 Nov 2026, as planned, with these differences:

- **Edit is `PUT`, not `PATCH`.** The builder always sends the whole
  collection, so the route replaces name, band and rules with the same
  checks as create.
- **Picked products are stored as `skus`;** `pinnedSkus` stays empty for
  company collections. Picking a product adds the SKUs of its options in
  stock when the builder loaded; SKUs that are not in the catalog never
  match, so they are not checked on save.
- **The send flow's "Build one" link sits behind `LET_THEM_CHOOSE`,** which
  hides "Let them choose" since the 28 Oct review. The Collections page,
  the builder, and Home's "Build a collection" work either way. Agreed on
  2 Nov to turn the flag back on, so "Let them choose", Home's collections
  strip and "Build one" are visible again.
- **The builder's preview** runs `collectionItems` on the products the page
  loaded, the same rule the API uses, so what it shows is what recipients
  can choose today.

**Verified**
- Unit: 4 domain tests (picked products, tags and brands together; input
  trimming and repeats; empty rules; name, band and size limits).
- Integration: 9 tests (create and list order; items within budget; edit;
  archive, then a new campaign refused and the name free again; send,
  hold and redeem from a company collection; redeem after archiving;
  another company's collection is not found to list, read, edit, archive
  or send; a platform collection can't change; refused input writes
  nothing).
- Break and restore: dropping the company filter from edit fails the
  other-company and platform tests; skipping the archived check fails the
  archive test.
