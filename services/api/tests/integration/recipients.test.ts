import { DIRECTORY_PAGE, MAX_UPLOAD_ROWS } from "@gifting/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAndSubmit, type Harness, MAYA, send, startHarness } from "./harness";

// Fictional people at .example domains only.
let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});

afterAll(async () => {
  await h?.close();
});

const upload = (rows: unknown[], extra: Record<string, unknown> = {}) =>
  h.app.inject({ method: "POST", url: "/v1/recipients/import", headers: MAYA, payload: { rows, ...extra } });

const lumen = { companyKey: "company-lumen-labs" };

describe("recipient upload", () => {
  it("adds new people to the directory with their names, in file order", async () => {
    const res = await upload([
      { email: "Priya.Shah@Upload.example", firstName: "Priya", lastName: "Shah" },
      { email: "leo.martin@upload.example" },
    ]);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ added: 2, existing: 0 });
    expect(body.recipients.map((r: { name: string; email: string }) => [r.name, r.email])).toEqual([
      ["Priya Shah", "priya.shah@upload.example"],
      ["Leo Martin", "leo.martin@upload.example"],
    ]);
    expect(await h.c.recipients.findOne({ ...lumen, emailLower: "priya.shah@upload.example" })).toMatchObject({ source: "csv", teamKey: null });
  });

  it("matches someone already in the directory, without changing their name", async () => {
    const before = await h.c.recipients.findOne({ ...lumen, emailLower: "jordan.rivera@lumenlabs.example" });
    const res = await upload([{ email: "jordan.rivera@lumenlabs.example", firstName: "Someone", lastName: "Else" }]);
    expect(res.json()).toMatchObject({ added: 0, existing: 1, recipients: [{ id: before!._id, name: before!.name }] });
    expect(await h.c.recipients.countDocuments({ ...lumen, emailLower: "jordan.rivera@lumenlabs.example" })).toBe(1);
  });

  it("adds nobody when the same list is uploaded again", async () => {
    const rows = [{ email: "again.one@upload.example" }, { email: "again.two@upload.example" }];
    expect((await upload(rows)).json()).toMatchObject({ added: 2 });
    const total = await h.c.recipients.countDocuments(lumen);
    expect((await upload(rows)).json()).toMatchObject({ added: 0, existing: 2 });
    expect(await h.c.recipients.countDocuments(lumen)).toBe(total);
  });

  it("adds one person when two uploads with the same email race", async () => {
    const rows = [{ email: "race@upload.example", firstName: "Race" }];
    const [a, b] = await Promise.all([upload(rows), upload(rows)]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(a.json().added + b.json().added).toBe(1);
    expect(await h.c.recipients.countDocuments({ ...lumen, emailLower: "race@upload.example" })).toBe(1);
  });

  it("keeps each company's directory apart, whatever the body says", async () => {
    await h.c.recipients.insertOne({
      _id: "rcp-other-company",
      companyKey: "company-orbit-fieldworks",
      teamKey: null,
      name: "Other Person",
      email: "shared@upload.example",
      emailLower: "shared@upload.example",
      phone: null,
      slackId: null,
      teamsId: null,
      birthdayMonthDay: null,
      startDate: null,
      startMonthDay: null,
      source: "manual",
      externalId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await upload([{ email: "shared@upload.example", firstName: "Lumen", lastName: "Person" }], { companyKey: "company-orbit-fieldworks" });
    expect(res.json()).toMatchObject({ added: 1, recipients: [{ name: "Lumen Person" }] });
    expect(res.json().recipients[0].id).not.toBe("rcp-other-company");
    expect(await h.c.recipients.findOne({ _id: "rcp-other-company" })).toMatchObject({ name: "Other Person" });
  });

  it("refuses a bad email, an over-long name, an empty list or too many rows, and writes nothing", async () => {
    const total = await h.c.recipients.countDocuments(lumen);
    const bad = [
      [{ email: "fine@upload.example" }, { email: "not-an-email" }],
      [{ email: "long@upload.example", firstName: "x".repeat(81) }],
      [{ email: "unreadable@upload.example", firstName: `Jos${String.fromCharCode(0xfffd)}` }],
      [],
      Array.from({ length: MAX_UPLOAD_ROWS + 1 }, (_, i) => ({ email: `many-${i}@upload.example` })),
    ];
    for (const rows of bad) {
      const res = await upload(rows);
      expect(res.statusCode, JSON.stringify(rows).slice(0, 60)).toBe(400);
    }
    expect(await h.c.recipients.countDocuments(lumen)).toBe(total);
  });

  it("lets a campaign go to the uploaded people", async () => {
    const { recipients } = (await upload([{ email: "send.one@upload.example" }, { email: "send.two@upload.example" }])).json();
    const { submitted } = await createAndSubmit(h.app, MAYA, send({ recipientIds: recipients.map((r: { id: string }) => r.id) }));
    expect(submitted?.statusCode).toBe(200);
    expect(submitted?.json().gifts).toBe(2);
  });
});

// Last: it fills the directory past one page.
describe("a directory bigger than one page", () => {
  const list = (q?: string) => h.app.inject({ method: "GET", url: `/v1/recipients${q ? `?q=${encodeURIComponent(q)}` : ""}`, headers: MAYA });

  it("saves a full list of 500 in one go", async () => {
    const rows = Array.from({ length: MAX_UPLOAD_ROWS }, (_, i) => ({
      email: `bulk-${String(i).padStart(3, "0")}@upload.example`,
      firstName: "Bulk",
      lastName: `Person ${String(i).padStart(3, "0")}`,
    }));
    const started = Date.now();
    const res = await upload(rows);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ added: MAX_UPLOAD_ROWS, existing: 0 });
    expect(res.json().recipients[MAX_UPLOAD_ROWS - 1]).toMatchObject({ name: "Bulk Person 499", email: "bulk-499@upload.example" });
    // The sender app gives up after 10 seconds; one bulk write is far inside that.
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("lists the first page, says there are more, and finds anyone by search", async () => {
    await upload([{ email: "zara.quill@upload.example", firstName: "Zara", lastName: "Quill" }]);
    const first = (await list()).json();
    expect(first.recipients).toHaveLength(DIRECTORY_PAGE);
    expect(first.more).toBe(true);
    expect(first.recipients.map((r: { name: string }) => r.name)).not.toContain("Zara Quill");

    const found = (await list("quill")).json();
    expect(found).toEqual({ recipients: [expect.objectContaining({ name: "Zara Quill" })], more: false });
    expect((await list("ZARA.QUILL@")).json().recipients).toHaveLength(1);
  });

  it("reads a search as plain text", async () => {
    const res = await list("a.(*");
    expect(res.statusCode).toBe(200);
    expect(res.json().recipients).toEqual([]);
  });
});
