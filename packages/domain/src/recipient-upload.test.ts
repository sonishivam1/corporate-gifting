import { describe, expect, it } from "vitest";

import { decodeCsv, MAX_UPLOAD_ROWS, nameFromEmail, parseRecipientCsv, UPLOAD_TEMPLATE, uploadRow, uploadRowName } from "./recipient-upload";

// Fictional people at .example domains only.
describe("parseRecipientCsv", () => {
  it("reads the template", () => {
    expect(parseRecipientCsv(UPLOAD_TEMPLATE)).toEqual({
      rows: [{ email: "jordan.rivera@company.example", firstName: "Jordan", lastName: "Rivera" }],
      problems: [],
    });
  });

  it("matches headers in any order and case, with a BOM, CRLF and blank lines", () => {
    const text = `${String.fromCharCode(0xfeff)}Last Name,E-mail,First_Name\r\nCohen,SAM.COHEN@Company.example,Sam\r\n\r\n,noor.park@company.example,\r\n`;
    expect(parseRecipientCsv(text)).toEqual({
      rows: [
        { email: "sam.cohen@company.example", firstName: "Sam", lastName: "Cohen" },
        { email: "noor.park@company.example" },
      ],
      problems: [],
    });
  });

  it("reads quoted fields with commas and quotes", () => {
    const { rows } = parseRecipientCsv('email,first name,last name\nmei@company.example,"Mei, Jr.","O""Malik"\n');
    expect(rows[0]).toEqual({ email: "mei@company.example", firstName: "Mei, Jr.", lastName: 'O"Malik' });
  });

  it("reads a quote inside a name as a quote", () => {
    const { rows, problems } = parseRecipientCsv(["email,first name,last name", 'mo@company.example,Mo,O"Malik', "kai@company.example,Kai,Lee"].join("\n"));
    expect(problems).toEqual([]);
    expect(rows.map((r) => r.lastName)).toEqual(['O"Malik', "Lee"]);
  });

  it("reports a quote that is never closed on its line, and still reads every line after it", () => {
    const text = [
      "email,first name,last name",
      "a@company.example,Ann,Lee",
      'b@company.example,"Bo,Kim',
      "c@company.example,Cy,Park",
      "d@company.example,Di,Ito",
      "",
    ].join("\n");
    const { rows, problems } = parseRecipientCsv(text);
    expect(rows.map((r) => r.email)).toEqual(["a@company.example", "c@company.example", "d@company.example"]);
    expect(problems).toEqual([{ line: 3, message: 'A quote mark (") on this line is never closed. Remove it, or close it, and upload again.' }]);
  });

  it("numbers lines as the file does when a quoted field spans lines", () => {
    const { problems } = parseRecipientCsv(["email,first name", 'a@company.example,"Ann', 'Marie"', "not-an-email,Bob"].join("\n"));
    expect(problems).toEqual([{ line: 4, message: '"not-an-email" isn\'t an email address.' }]);
  });

  it("refuses a name with characters that couldn't be read", () => {
    const bad = ["email,first name", `j@company.example,Jos${String.fromCharCode(0xfffd)}`].join("\n");
    expect(parseRecipientCsv(bad).problems[0]).toEqual({
      line: 2,
      message: "A name has characters that couldn't be read. Save the file as CSV UTF-8 and upload it again.",
    });
    expect(uploadRow.safeParse({ email: "j@company.example", firstName: `Jos${String.fromCharCode(0xfffd)}` }).success).toBe(false);
  });

  it("splits a single name column", () => {
    const { rows } = parseRecipientCsv("name,email\nElena Sato Ruiz,elena@company.example\n");
    expect(rows[0]).toEqual({ email: "elena@company.example", firstName: "Elena", lastName: "Sato Ruiz" });
  });

  it("reports problems by line and keeps the good rows", () => {
    const text = ["email,first name", "a@company.example,Ann", "not-an-email,Bob", ",Cat", "A@company.example,Ann again", `d@company.example,${"x".repeat(81)}`].join("\n");
    const { rows, problems } = parseRecipientCsv(text);
    expect(rows.map((r) => r.email)).toEqual(["a@company.example"]);
    expect(problems).toEqual([
      { line: 3, message: '"not-an-email" isn\'t an email address.' },
      { line: 4, message: "The email is missing." },
      { line: 5, message: "a@company.example is already on line 2; it's used once." },
      { line: 6, message: "A name is longer than 80 characters." },
    ]);
  });

  it("refuses a file without an email column, or with too many people", () => {
    expect(parseRecipientCsv("first name,last name\nAnn,Lee\n").problems[0]?.line).toBe(1);
    const many = ["email", ...Array.from({ length: MAX_UPLOAD_ROWS + 1 }, (_, i) => `p${i}@company.example`)].join("\n");
    expect(parseRecipientCsv(many).problems.at(-1)?.message).toContain(`up to ${MAX_UPLOAD_ROWS}`);
  });
});

describe("decodeCsv", () => {
  const text = ["email,first name", "j@company.example,José", ""].join("\n");

  it("reads UTF-8, with or without a byte order mark", () => {
    const utf8 = new TextEncoder().encode(text);
    expect(decodeCsv(utf8)).toBe(text);
    expect(parseRecipientCsv(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).rows[0]?.firstName).toBe("José");
  });

  it("reads Excel's plain CSV on Windows (Windows-1252) without losing accents", () => {
    const cp1252 = new Uint8Array([...text].map((ch) => ch.charCodeAt(0)));
    expect(decodeCsv(cp1252)).toBe(text);
  });

  it("reads UTF-16 by its byte order mark", () => {
    const utf16 = new Uint8Array([0xff, 0xfe, ...[...text].flatMap((ch) => [ch.charCodeAt(0), 0])]);
    expect(decodeCsv(utf16)).toBe(text);
  });
});

describe("names", () => {
  it("joins first and last name, or guesses one from the email", () => {
    expect(uploadRowName({ email: "x@company.example", firstName: "Ann", lastName: "Lee" })).toBe("Ann Lee");
    expect(uploadRowName({ email: "jordan.rivera@company.example" })).toBe("Jordan Rivera");
    expect(nameFromEmail("omar_okafor-2@company.example")).toBe("Omar Okafor 2");
  });
});
