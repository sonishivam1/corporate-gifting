import { createLogger } from "@gifting/logger";
import { describe, expect, it } from "vitest";

import { logChannel } from "./adapters/log";
import { createChannelRegistry } from "./registry";
import type { GiftMessage } from "./types";

const message: GiftMessage = {
  giftId: "g1",
  companyKey: "company-acme",
  to: "sam@example.com",
  link: "http://localhost:3001/r/secret-token",
  greeting: "Happy birthday!",
  senderName: "Maya",
  branding: { brandColor: null, logoUrl: null },
};

function captureLogger() {
  const lines: string[] = [];
  const log = createLogger("channels", {}, { level: "info", destination: { write: (l: string) => void lines.push(l) } });
  return { lines, log };
}

describe("channel registry", () => {
  it("finds a channel by kind", () => {
    const registry = createChannelRegistry([logChannel("email"), logChannel("slack")]);
    expect(registry.kinds()).toEqual(["email", "slack"]);
    expect(registry.get("slack").kind).toBe("slack");
    expect(registry.has("sms")).toBe(false);
  });

  it("refuses unknown and duplicate kinds", () => {
    expect(() => createChannelRegistry([]).get("sms")).toThrow("No channel registered for sms.");
    expect(() => createChannelRegistry([logChannel("email"), logChannel("email")])).toThrow("Two channels");
  });
});

describe("log channel", () => {
  it("reports a provider message id", async () => {
    const result = await logChannel("email", captureLogger().log).send(message);
    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toMatch(/^log-/);
  });

  it("never logs the recipient or the link", async () => {
    const { lines, log } = captureLogger();
    await logChannel("email", log).send(message);
    await logChannel("email", log).remind(message, 1);
    const text = lines.join("\n");
    expect(text).toContain("g1");
    expect(text).not.toContain("sam@example.com");
    expect(text).not.toContain("secret-token");
  });
});
