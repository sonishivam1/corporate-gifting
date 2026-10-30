// One mailer for account and gift emails: where each goes, whatever is (or isn't) configured.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { emailChannel, type GiftMessage } from "@gifting/channels";
import type { Logger } from "@gifting/logger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultDeps } from "../deps";
import { createMailer, type Email } from "./mailer";

const FROM = "Gifting <no-reply@gifting.example>";
// Nothing listens on port 1, so the connection is refused straight away.
const NOBODY_LISTENING = "smtp://127.0.0.1:1";

const email: Email = { to: "sam@example.com", subject: "Hello there", text: "Hi", html: "<p>Hi</p>" };
const gift: GiftMessage = {
  giftId: "g1",
  companyKey: "company-acme",
  to: "sam@example.com",
  link: "https://gifts.example.com/r/the-private-token",
  greeting: "Thank you!",
  senderName: "Dana",
  recipientName: "Sam Lee",
  branding: { brandColor: null, logoUrl: null },
};

let dir: string;
const log = { warn: vi.fn() } as unknown as Logger;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "gifting-outbox-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const emlFiles = async () => (await readdir(dir)).filter((f) => f.endsWith(".eml"));
const outboxText = async () => (await Promise.all((await readdir(dir)).map((f) => readFile(path.join(dir, f), "utf8")))).join("\n");

describe("with no SMTP set", () => {
  it("writes emails to the outbox outside production, and returns an id", async () => {
    const mailer = createMailer({ from: FROM, outboxDir: dir, production: false, log });
    const { messageId } = await mailer.send(email);
    expect(messageId).toMatch(/^outbox-/);
    expect(await readdir(dir)).toHaveLength(2); // the .eml and the .html preview
  });

  it("refuses to start in production, so an email is never silently dropped", () => {
    expect(() => createMailer({ from: FROM, outboxDir: dir, production: true, log })).toThrow("No SMTP server is set");
  });

  it("keeps every email of a campaign: one subject, sent at the same moment", async () => {
    const mailer = createMailer({ from: FROM, outboxDir: dir, production: false, log });
    await Promise.all(Array.from({ length: 20 }, () => mailer.send(email)));
    expect(await emlFiles()).toHaveLength(20);
  });
});

describe("when SMTP can't be reached", () => {
  it("falls back to the outbox outside production", async () => {
    const mailer = createMailer({ smtp: NOBODY_LISTENING, from: FROM, outboxDir: dir, production: false, log });
    expect((await mailer.send(email)).messageId).toMatch(/^outbox-/);
    expect(await emlFiles()).toHaveLength(1);
  });

  it("fails in production, and writes nothing to disk", async () => {
    const mailer = createMailer({ smtp: NOBODY_LISTENING, from: FROM, outboxDir: dir, production: true, log });
    await expect(mailer.send(email)).rejects.toThrow();
    expect(await readdir(dir)).toHaveLength(0);
  });
});

describe("gift emails", () => {
  it("reach the outbox with their link, because a link is stored only as a hash and can't be read back", async () => {
    const mailer = createMailer({ from: FROM, outboxDir: dir, production: false, log });
    const channels = defaultDeps({}, { mailer }).channels!;

    const result = await channels.get("email").send(gift);

    expect(result.providerMessageId).toMatch(/^outbox-/);
    const written = await outboxText();
    expect(written).toContain(gift.link);
    expect(written).toContain(`From: ${FROM}`);
    expect(written).toContain("To: Sam Lee <sam@example.com>");
  });

  it("follow the same setting as account emails: SMTP down falls back for both", async () => {
    const mailer = createMailer({ smtp: { host: "127.0.0.1", port: 1 }, from: FROM, outboxDir: dir, production: false, log });
    await emailChannel({ transport: { sendMail: (mail) => mailer.send(mail) } }).send(gift);
    await mailer.send(email);
    expect(await emlFiles()).toHaveLength(2);
  });

  it("are never registered without a mailer, so a gift stays queued instead of reporting sent", () => {
    expect(defaultDeps({ SMTP_URL: "smtp://mail.example:587" }).channels).toBeUndefined();
  });
});
