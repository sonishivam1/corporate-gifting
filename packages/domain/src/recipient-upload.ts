/**
 * Reading a recipient list from a CSV file (plan: recipient-upload.md). Pure:
 * the sender app reads the file in the browser for an instant preview, and
 * the API checks the rows again with `recipientImportInput`.
 *
 * Columns: email (required), first name and last name, or a single name, in
 * any order. Header names are matched loosely ("First name", "first_name",
 * "FirstName").
 */
import { z } from "zod";

export const MAX_UPLOAD_ROWS = 500;
const BOM = String.fromCharCode(0xfeff);
/** What a decoder puts in place of a character it couldn't read. */
const REPLACEMENT = String.fromCharCode(0xfffd);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
export const MAX_NAME_LENGTH = 80;

/** "jordan.rivera@…" → "Jordan Rivera": a readable name when the list has none. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

const email = z.string().trim().toLowerCase().pipe(z.email());
const namePart = z
  .string()
  .trim()
  .max(MAX_NAME_LENGTH)
  .refine((n) => !n.includes(REPLACEMENT), { error: "A name has characters that couldn't be read." })
  .optional();

export const uploadRow = z.object({ email, firstName: namePart, lastName: namePart });
export type UploadRow = z.infer<typeof uploadRow>;

/** The full name to store: first and last name, or one guessed from the email. */
export function uploadRowName(row: UploadRow): string {
  return [row.firstName, row.lastName].filter(Boolean).join(" ").slice(0, MAX_NAME_LENGTH) || nameFromEmail(row.email);
}

export type UploadProblem = { line: number; message: string };
export type ParsedUpload = { rows: UploadRow[]; problems: UploadProblem[] };

/**
 * A file's text. Excel's "CSV UTF-8" is UTF-8, but its plain "CSV" on
 * Windows uses the Windows code page, where é is one byte that isn't valid
 * UTF-8. Bytes that aren't UTF-8 are read as Windows-1252, so "José" stays
 * "José" instead of losing its é for good. "Unicode text" (UTF-16) is read
 * by its byte order mark.
 */
export function decodeCsv(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

type CsvRecord = { fields: string[]; line: number; unclosedQuote: boolean };

/**
 * RFC 4180 fields: commas and newlines inside quotes, "" for a quote. A quote
 * opens a quoted field only at the start of a field (O"Malik is a name). A
 * quote that is never closed would swallow the rest of the file, so it is
 * read as a plain character instead and its record marked.
 */
function csvRecords(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  const literal = new Set<number>();
  let field = "";
  let record: string[] = [];
  let quoted = false;
  let fieldStart = true;
  let unclosedQuote = false;
  let line = 1;
  let start = 1;
  let open = { at: 0, line: 1, start: 1, record: [] as string[], count: 0 };
  const end = () => {
    record.push(field);
    records.push({ fields: record, line: start, unclosedQuote });
    record = [];
    field = "";
    fieldStart = true;
    unclosedQuote = false;
  };
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length) {
      if (!quoted) break;
      // Back to the quote that never closed, and read it as a plain character.
      literal.add(open.at);
      ({ line, start } = open);
      record = [...open.record];
      records.length = open.count;
      field = "";
      quoted = false;
      i = open.at - 1;
      continue;
    }
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === LF) line++;
        field += ch;
      }
    } else if (ch === '"' && fieldStart && !literal.has(i)) {
      quoted = true;
      fieldStart = false;
      open = { at: i, line, start, record: [...record], count: records.length };
    } else if (ch === ",") {
      record.push(field);
      field = "";
      fieldStart = true;
    } else if (ch === LF || ch === CR) {
      if (ch === CR && text[i + 1] === LF) i++;
      end();
      line++;
      start = line;
    } else {
      if (literal.has(i)) unclosedQuote = true;
      field += ch;
      fieldStart = false;
    }
  }
  if (field !== "" || record.length) end();
  return records;
}

const header = (h: string) => h.trim().toLowerCase().replace(/[\s_-]+/g, "");
const COLUMNS = {
  email: ["email", "emailaddress", "e-mail", "mail"],
  firstName: ["firstname", "givenname", "first"],
  lastName: ["lastname", "surname", "familyname", "last"],
  name: ["name", "fullname"],
} as const;

/**
 * The valid rows and every problem, by line number in the file (the header
 * is line 1). An email that repeats is used once, and the repeat reported.
 */
export function parseRecipientCsv(text: string): ParsedUpload {
  // A byte order mark, which Excel adds when it saves as UTF-8 CSV.
  const records = csvRecords(text.startsWith(BOM) ? text.slice(1) : text);
  const headerRow = records[0]?.fields.map(header) ?? [];
  const column = (names: readonly string[]) => headerRow.findIndex((h) => names.includes(h));
  const at = { email: column(COLUMNS.email), firstName: column(COLUMNS.firstName), lastName: column(COLUMNS.lastName), name: column(COLUMNS.name) };
  if (at.email < 0) return { rows: [], problems: [{ line: 1, message: "There's no email column. Use the template: email, first name, last name." }] };

  const rows: UploadRow[] = [];
  const problems: UploadProblem[] = [];
  const seen = new Map<string, number>();
  for (const { fields: record, line, unclosedQuote } of records.slice(1)) {
    if (record.every((f) => f.trim() === "")) continue;
    if (unclosedQuote) {
      problems.push({ line, message: 'A quote mark (") on this line is never closed. Remove it, or close it, and upload again.' });
      continue;
    }
    const cell = (index: number) => (index >= 0 ? (record[index] ?? "").trim() : "");
    let firstName = cell(at.firstName);
    let lastName = cell(at.lastName);
    // A single "name" column: the first word is the first name, the rest the last name.
    if (!firstName && !lastName && at.name >= 0) {
      const [given = "", ...rest] = cell(at.name).split(/\s+/);
      firstName = given;
      lastName = rest.join(" ");
    }
    if (`${firstName}${lastName}`.includes(REPLACEMENT)) {
      problems.push({ line, message: "A name has characters that couldn't be read. Save the file as CSV UTF-8 and upload it again." });
      continue;
    }
    const parsed = uploadRow.safeParse({ email: cell(at.email), firstName: firstName || undefined, lastName: lastName || undefined });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      const message = !cell(at.email)
        ? "The email is missing."
        : field === "email"
          ? `"${cell(at.email)}" isn't an email address.`
          : `A name is longer than ${MAX_NAME_LENGTH} characters.`;
      problems.push({ line, message });
      continue;
    }
    const first = seen.get(parsed.data.email);
    if (first !== undefined) {
      problems.push({ line, message: `${parsed.data.email} is already on line ${first}; it's used once.` });
      continue;
    }
    seen.set(parsed.data.email, line);
    rows.push(parsed.data);
  }
  if (rows.length > MAX_UPLOAD_ROWS) {
    problems.push({ line: 1, message: `The file has ${rows.length} people; a list can have up to ${MAX_UPLOAD_ROWS}.` });
  }
  return { rows, problems };
}

/** The template a sender downloads. */
export const UPLOAD_TEMPLATE = "email,first name,last name\njordan.rivera@company.example,Jordan,Rivera\n";
