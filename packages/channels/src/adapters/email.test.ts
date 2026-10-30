import { createStaticContent } from "@gifting/content";
import nodemailer from "nodemailer";
import { describe, expect, it } from "vitest";

import type { GiftMessage } from "../types";
import { composeGiftEmail, emailChannel, escapeHtml } from "./email";

const message: GiftMessage = {
  giftId: "g1",
  companyKey: "company-acme",
  to: "sam@example.com",
  link: "https://gifts.example.com/r/abc",
  greeting: "Thank you!",
  senderName: "Dana at Acme",
  recipientName: "Sam Lee",
  message: "Enjoy.",
  expiresOn: "2026-12-01",
  branding: { brandColor: null, logoUrl: null },
};

/** nodemailer's JSON transport builds the real message without a connection, so the mapping can be checked offline. */
async function sendOne(m: GiftMessage, reminder = false) {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const original = transport.sendMail.bind(transport);
  let mail: Record<string, unknown> = {};
  transport.sendMail = (async (options: Parameters<typeof original>[0]) => {
    const info = await original(options);
    mail = JSON.parse(String((info as { message?: string }).message));
    return info;
  }) as typeof transport.sendMail;
  const channel = emailChannel({ transport, from: "Digital Gifting <gifts@digital-gifting.example>", replyTo: "help@digital-gifting.example" });
  const result = reminder ? await channel.remind(m, 1) : await channel.send(m);
  return { result, mail };
}

describe("the gift email", () => {
  it("puts the same words and the same link in both parts", async () => {
    const { subject, text, html } = await composeGiftEmail(createStaticContent(), message, false);
    expect(subject).toBe("Dana at Acme sent you a gift");
    expect(text).toContain("Hi Sam Lee,");
    expect(text).toContain("https://gifts.example.com/r/abc");
    expect(text).toContain("Dec 1, 2026");
    expect(html).toContain('href="https://gifts.example.com/r/abc"');
    expect(html).toContain("Open your gift");
  });

  it("escapes names and messages in the HTML, so user input cannot inject markup", async () => {
    const { html, text } = await composeGiftEmail(createStaticContent(), { ...message, recipientName: "<img src=x onerror=alert(1)>", message: "<script>steal()</script>" }, false);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(text).toContain("<script>"); // the plain-text part is not HTML, so it is left as written
  });

  it("has no tracking pixel or remote image", async () => {
    const { html } = await composeGiftEmail(createStaticContent(), message, false);
    expect(html).not.toMatch(/<img|background-image|url\(/i);
  });

  it("refuses a link that is not http or https", async () => {
    await expect(composeGiftEmail(createStaticContent(), { ...message, link: "javascript:alert(1)" }, false)).rejects.toThrow("http");
  });

  it("only takes a plain hex brand colour, so a colour cannot carry markup", async () => {
    const good = await composeGiftEmail(createStaticContent(), { ...message, branding: { brandColor: "#112233", logoUrl: null } }, false);
    expect(good.html).toContain("#112233");
    const bad = await composeGiftEmail(createStaticContent(), { ...message, branding: { brandColor: '#fff"><script>', logoUrl: null } }, false);
    expect(bad.html).not.toContain("<script>");
  });

  it("escapes every HTML special character", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});

describe("the email channel", () => {
  it("sends both parts, from the configured address, to the named recipient", async () => {
    const { result, mail } = await sendOne(message);
    expect(result).toMatchObject({ status: "sent", providerMessageId: expect.any(String) });
    expect(mail).toMatchObject({ subject: "Dana at Acme sent you a gift" });
    expect(String(mail.html)).toContain("Open your gift");
    expect(mail.from).toMatchObject({ address: "gifts@digital-gifting.example", name: "Digital Gifting" });
    expect(mail.to).toEqual([{ address: "sam@example.com", name: "Sam Lee" }]);
    expect(mail.replyTo).toEqual([{ address: "help@digital-gifting.example", name: "" }]);
  });

  it("marks the message as automatic and keeps the gift id in a header, not the body", async () => {
    const { mail } = await sendOne(message);
    expect(mail.headers).toMatchObject({ "Auto-Submitted": "auto-generated", "X-Tag-gift": "g1" });
    expect(String(mail.text)).not.toContain("g1");
  });

  it("sends a reminder with its own subject", async () => {
    const { mail } = await sendOne(message, true);
    expect(mail.subject).toBe("Your gift from Dana at Acme is waiting");
  });
});
