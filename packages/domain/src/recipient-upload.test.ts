import { describe, expect, it } from "vitest";

import { MAX_UPLOAD_ROWS, nameFromEmail, parseRecipientCsv, UPLOAD_TEMPLATE, uploadRowName } from "./recipient-upload";

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

describe("names", () => {
  it("joins first and last name, or guesses one from the email", () => {
    expect(uploadRowName({ email: "x@company.example", firstName: "Ann", lastName: "Lee" })).toBe("Ann Lee");
    expect(uploadRowName({ email: "jordan.rivera@company.example" })).toBe("Jordan Rivera");
    expect(nameFromEmail("omar_okafor-2@company.example")).toBe("Omar Okafor 2");
  });
});
