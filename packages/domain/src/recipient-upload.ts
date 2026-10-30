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
const namePart = z.string().trim().max(MAX_NAME_LENGTH).optional();

export const uploadRow = z.object({ email, firstName: namePart, lastName: namePart });
export type UploadRow = z.infer<typeof uploadRow>;

/** The full name to store: first and last name, or one guessed from the email. */
export function uploadRowName(row: UploadRow): string {
  return [row.firstName, row.lastName].filter(Boolean).join(" ").slice(0, MAX_NAME_LENGTH) || nameFromEmail(row.email);
}

export type UploadProblem = { line: number; message: string };
export type ParsedUpload = { rows: UploadRow[]; problems: UploadProblem[] };

/** RFC 4180 fields: commas and newlines inside quotes, "" for a quote. */
function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }
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
  const headerRow = records[0]?.map(header) ?? [];
  const column = (names: readonly string[]) => headerRow.findIndex((h) => names.includes(h));
  const at = { email: column(COLUMNS.email), firstName: column(COLUMNS.firstName), lastName: column(COLUMNS.lastName), name: column(COLUMNS.name) };
  if (at.email < 0) return { rows: [], problems: [{ line: 1, message: "There's no email column. Use the template: email, first name, last name." }] };

  const rows: UploadRow[] = [];
  const problems: UploadProblem[] = [];
  const seen = new Map<string, number>();
  records.slice(1).forEach((record, i) => {
    const line = i + 2;
    if (record.every((f) => f.trim() === "")) return;
    const cell = (index: number) => (index >= 0 ? (record[index] ?? "").trim() : "");
    let firstName = cell(at.firstName);
    let lastName = cell(at.lastName);
    // A single "name" column: the first word is the first name, the rest the last name.
    if (!firstName && !lastName && at.name >= 0) {
      const [given = "", ...rest] = cell(at.name).split(/\s+/);
      firstName = given;
      lastName = rest.join(" ");
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
      return;
    }
    const first = seen.get(parsed.data.email);
    if (first !== undefined) {
      problems.push({ line, message: `${parsed.data.email} is already on line ${first}; it's used once.` });
      return;
    }
    seen.set(parsed.data.email, line);
    rows.push(parsed.data);
  });
  if (rows.length > MAX_UPLOAD_ROWS) {
    problems.push({ line: 1, message: `The file has ${rows.length} people; a list can have up to ${MAX_UPLOAD_ROWS}.` });
  }
  return { rows, problems };
}

/** The template a sender downloads. */
export const UPLOAD_TEMPLATE = "email,first name,last name\njordan.rivera@company.example,Jordan,Rivera\n";
