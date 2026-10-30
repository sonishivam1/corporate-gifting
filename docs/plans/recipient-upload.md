# Recipient upload in the send flow

**Status:** Built (not yet committed)
**Agreed:** 30 Oct 2026 · **Built:** 30 Oct 2026

## Goal

Today a sender adds recipients one at a time: pick from the company
directory, or type one email. Sending to a whole team or an event list
means typing every address, and names are guessed from the email
("jordan.rivera@…" becomes "Jordan Rivera"). This step adds **Upload a
list** to the recipients step: a CSV of email, first name and last name.
The sender sees a preview with problems flagged, confirms, and everyone
valid joins the company directory and is ticked for the campaign. It is the
first slice of M5.1 (recipient directory and CSV import), pulled forward for
the send flow.

## Scope

| # | Piece | Where |
| --- | --- | --- |
| 1 | `parseRecipientCsv(text)`: reads the file into rows and problems (header names in any order and case; quoted fields; a UTF-8 BOM; blank lines). Pure, with tests | `packages/domain` |
| 2 | `recipientImportInput` (up to 500 rows of `email`, `firstName?`, `lastName?`) and `recipientImportView` | `packages/domain` (views) |
| 3 | `POST /v1/recipients/import`: checks every row again, adds new people (`source: "csv"`), matches existing ones by email, and returns them in file order with counts | `services/api` recipients module |
| 4 | **Upload a list** on the recipients step: choose a file, preview (valid rows, problems by row number), confirm, then the people are ticked. A **template** to download | `apps/sender` |
| 5 | Integration tests, including what must be refused | `services/api/tests/integration` |

Not in scope: Excel files, birthdays and start dates (M5), HR sync (M5.2),
editing or deleting directory entries, encryption of personal fields (M5.1
proper), uploads outside the send flow.

## Decisions

1. **Uploaded people join the company directory** (agreed 30 Oct), like
   "Add someone by email" today. They can be picked again in later
   campaigns. The directory is per company; the company comes from the
   session, never the request.
2. **Columns: email (required), first name, last name** (agreed 30 Oct).
   Headers `email`, `first name` / `firstname` / `first_name`, `last name`
   and so on, in any order. A row without names gets a name guessed from
   the email, as today. A single `name` column is accepted too.
3. **CSV only** (agreed 30 Oct). Excel and Google Sheets save as CSV. The
   file is read in the browser, so the preview is instant and the file
   itself is never uploaded; only the rows are sent.
4. **An existing person keeps their record.** If the email is already in
   the directory, the upload uses that person and doesn't change their
   name. One email is one person: the unique `{companyKey, emailLower}`
   index guarantees it, also when two uploads race.
5. **All or nothing on the server.** The app sends only rows that passed
   its own check; the API checks them again and refuses the whole request
   (`400 invalid_request`) if any row is invalid. A repeat of the same
   upload adds nobody new.
6. **Limits:** 500 rows per file, the same as the most people a campaign
   can have. Names up to 80 characters.
7. **Personal data:** names and emails are never logged; the API logs
   counts only. Encryption at rest comes with M5.1.

## Tests

- Unit (`parseRecipientCsv`): header variants, quoted commas, BOM, blank
  lines, a missing email column, bad emails flagged with their row number,
  duplicates within the file flagged.
- Integration:
  - an upload adds new people with their names and `source: "csv"`, and
    returns them in file order;
  - an email already in the directory is matched, not duplicated, and its
    name is unchanged;
  - the same upload twice adds nobody the second time;
  - the same email in another company is a separate person (scope);
  - more than 500 rows, an invalid email or an over-long name is refused
    and nothing is written;
  - uploaded people can then be sent a campaign.
- Break and restore: drop `companyKey` from the match, and the
  other-company test fails.
- `pnpm lint`, `typecheck`, `test`, `build` and `test:integration` pass.

## Docs to update

`docs/technical/api.md` (the route), `docs/product/features.md` (recipient
directory: partly built), `docs/architecture/data-model.md` (`source:
"csv"` in use), `docs/product/roadmap.md`, the build log, the changelog,
and this plan's As built section.

## As built

Built on 30 Oct 2026, as planned.

- **Shared add-or-match.** The API's existing "add someone by email" and
  the upload now share one `ensure()` in the recipients service. It adds
  or matches by `{companyKey, emailLower}` and reports whether the person
  was new. When two uploads race on one email, the unique index lets one
  in and the other reads it back.
- **`nameFromEmail` moved to `@gifting/domain`,** so the preview shows the
  same guessed name the API will store.
- **The flow keeps its own copy of the directory,** so uploaded people
  appear in the list at once, ticked. The step refuses more than 500
  directory people with a clear message instead of an API error.

**Verified**
- Unit: 7 parser tests (template, headers in any order and case, BOM,
  CRLF, blank lines, quoted fields, a single name column, problems by
  line, repeats, too many rows, no email column).
- Integration: 7 tests (see Tests above), all passing.
- Break and restore: dropping `companyKey` from the match fails the
  other-company test.

**Review fixes (30 Oct 2026)**
- **A stray quote** (`"Bo,Kim` with no closing quote) used to swallow the
  rest of the file without a word. A quote now opens a quoted field only
  at the start of a field (`O"Malik` is a name), and one that never closes
  is reported on its own line; every line after it is still read. Line
  numbers follow the file when a quoted field spans lines.
- **Excel's plain CSV on Windows** is Windows-1252, not UTF-8, so "José"
  arrived as "Jos" plus an unreadable character, for good (there is no
  directory edit, and a re-upload keeps the old name). `decodeCsv` reads
  the bytes as UTF-8, falls back to Windows-1252, and reads UTF-16 by its
  byte order mark. A name that still holds an unreadable character is
  refused by the preview and by the API.
- **Directories over 500 people:** the API read the first 500 by name and
  then filtered, so search never found anyone past them. The search now
  runs in MongoDB, the list says `more`, and the send flow searches the
  server as the sender types when there is more than one page.
- **A 500-row upload** was 500 round trips and could pass the sender
  app's 10-second limit, leaving part of the list saved. It is now one
  bulk write and one read; a retry finishes a half-saved list.
- **Smaller:** "and 12 mores" in the preview; Cancel (and closing the
  dialog) is disabled while the save runs, since it can't be called back.
- **Verified:** 5 more parser and decoding tests; 3 more integration
  tests (500 rows in one go, a directory past one page, a search with
  regex characters) and an unreadable name in the refusals test. Break
  and restore: reading to the end of the file on an unclosed quote fails
  its test; dropping the search filter fails both directory tests.

**Lesson**
- The editing tools turned the escape for a byte order mark into the
  invisible character itself, which ESLint rejects. The code uses
  `String.fromCharCode(0xfeff)` instead.
