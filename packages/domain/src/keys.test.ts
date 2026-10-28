import { describe, expect, it } from "vitest";

import { giftIdFromOrderNumber, ledgerKeys, occurrenceKey, orderNumberForGift } from "./keys";

describe("ledger keys", () => {
  it("are deterministic, so a retry builds the same key", () => {
    expect(ledgerKeys.capture("g1", 1)).toBe(ledgerKeys.capture("g1", 1));
    expect(ledgerKeys.hold("g1", 1)).toBe("hold:g1:1");
    expect(ledgerKeys.release("g1", 2)).toBe("release:g1:2");
    expect(ledgerKeys.topUp("pi_123")).toBe("top-up:pi_123");
    expect(ledgerKeys.adjustment("a1")).toBe("adjustment:a1");
  });

  it("differ per hold, so a reopened gift gets fresh keys", () => {
    expect(ledgerKeys.capture("g1", 1)).not.toBe(ledgerKeys.capture("g1", 2));
  });

  it("refuse ids that could collide", () => {
    expect(() => ledgerKeys.hold("", 1)).toThrow(RangeError);
    expect(() => ledgerKeys.hold("a:b", 1)).toThrow(RangeError);
    expect(() => ledgerKeys.hold("g1", 0)).toThrow(RangeError);
    expect(() => ledgerKeys.hold("g1", 1.5)).toThrow(RangeError);
  });
});

describe("order numbers", () => {
  it("round-trip a gift id", () => {
    expect(orderNumberForGift("3f6c2a")).toBe("GFT-3f6c2a");
    expect(giftIdFromOrderNumber("GFT-3f6c2a")).toBe("3f6c2a");
  });

  it("ignore orders that are not gifts", () => {
    expect(giftIdFromOrderNumber("ORD-1")).toBeNull();
    expect(giftIdFromOrderNumber("GFT-")).toBeNull();
  });
});

describe("occurrence keys", () => {
  it("are one per date", () => {
    expect(occurrenceKey({ year: 2026, month: 11, day: 3 })).toBe("2026-11-03");
  });
});
