import { describe, expect, it } from "vitest";

import { ContentError, createMemoryContent, createStaticContent, renderTemplate, STRINGS } from "./index";

describe("renderTemplate", () => {
  it("fills placeholders, numbers included", () => {
    expect(renderTemplate("Hi {name}, you have {count} gifts.", { name: "Sam", count: 2 })).toBe("Hi Sam, you have 2 gifts.");
  });

  it("uses a value more than once", () => {
    expect(renderTemplate("{a} and {a}", { a: "x" })).toBe("x and x");
  });

  it("refuses a missing value instead of sending a half-filled text", () => {
    expect(() => renderTemplate("Hi {name}", {})).toThrow(ContentError);
    expect(() => renderTemplate("Hi {name}")).toThrow("{name}");
  });

  it("leaves text without placeholders alone", () => {
    expect(renderTemplate("No placeholders { here }")).toBe("No placeholders { here }");
  });
});

describe("memory content", () => {
  const content = createMemoryContent({ "greet": "Hello {name}" });

  it("returns the text for a key", async () => {
    await expect(content.getContent("greet", { name: "Sam" })).resolves.toBe("Hello Sam");
  });

  it("refuses an unknown key", async () => {
    await expect(content.getContent("nope")).rejects.toMatchObject({ code: "missing_key" });
  });
});

describe("static content", () => {
  const content = createStaticContent();

  it("fills the gift email", async () => {
    const subject = await content.getContent("email.gift.subject", { senderName: "Dana" });
    expect(subject).toBe("Dana sent you a gift");
    const greeting = await content.getContent("email.gift.greeting", { recipientName: "Sam" });
    expect(greeting).toBe("Hi Sam,");
    expect(await content.getContent("email.gift.expires", { closesOn: "Dec 1, 2026" })).toContain("Dec 1, 2026");
  });

  it("refuses to render a string with a value missing", async () => {
    await expect(content.getContent("email.gift.subject")).rejects.toMatchObject({ code: "missing_value" });
  });

  it("has a non-empty string for every key", () => {
    for (const [key, text] of Object.entries(STRINGS)) expect(text.trim().length, key).toBeGreaterThan(0);
  });
});
