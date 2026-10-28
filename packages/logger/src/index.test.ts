import { describe, expect, it } from "vitest";

import { AppError, createLogger, MASK } from "./index";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const destination = { write: (line: string) => void lines.push(JSON.parse(line)) };
  return { lines, destination };
}

describe("logger", () => {
  it("writes structured lines with the area and context", () => {
    const { lines, destination } = capture();
    createLogger("gifts", { requestId: "req-1" }, { level: "info", destination }).info({ giftId: "g1" }, "gift redeemed");
    expect(lines[0]).toMatchObject({ area: "gifts", requestId: "req-1", giftId: "g1", msg: "gift redeemed" });
  });

  it("redacts personal and secret fields, top level and nested", () => {
    const { lines, destination } = capture();
    createLogger("recipients", {}, { level: "info", destination }).info(
      { email: "sam@example.com", token: "abc", recipient: { phone: "+15550100", name: "Sam" }, giftId: "g1" },
      "imported",
    );
    expect(lines[0]).toMatchObject({ email: MASK, token: MASK, recipient: { phone: MASK, name: MASK }, giftId: "g1" });
    expect(JSON.stringify(lines[0])).not.toContain("sam@example.com");
  });

  it("logs only the name and code of errors we didn't raise", () => {
    const { lines, destination } = capture();
    const log = createLogger("ct", {}, { level: "info", destination });
    const providerError = Object.assign(new Error("request for sam@example.com failed"), { code: "E_HTTP" });
    log.error({ err: providerError }, "call failed");
    log.error({ err: new AppError("over_budget", "Total exceeds the hold.") }, "refused");
    expect(lines[0]?.err).toEqual({ type: "Error", code: "E_HTTP" });
    expect(lines[1]?.err).toMatchObject({ code: "over_budget", message: "Total exceeds the hold." });
  });

  it("is silent under test by default", () => {
    expect(createLogger("any").level).toBe("silent");
  });
});
