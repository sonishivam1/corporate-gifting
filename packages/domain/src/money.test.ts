import { describe, expect, it } from "vitest";

import { cents, formatCents, sumCents, toCents } from "./money";

describe("money", () => {
  it("accepts non-negative integer cents only", () => {
    expect(cents(0)).toBe(0);
    expect(cents(5000)).toBe(5000);
    expect(() => cents(10.5)).toThrow(RangeError);
    expect(() => cents(-1)).toThrow(RangeError);
    expect(() => cents(Number.NaN)).toThrow(RangeError);
  });

  it("parses decimal strings without floating point", () => {
    expect(toCents("50")).toBe(5000);
    expect(toCents("50.5")).toBe(5050);
    expect(toCents("50.05")).toBe(5005);
    expect(toCents("0.10")).toBe(10);
    expect(toCents(" 19.99 ")).toBe(1999);
  });

  it("refuses amounts it cannot represent exactly", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1,000.00", "1e3"]) {
      expect(() => toCents(bad), bad).toThrow(RangeError);
    }
  });

  it("sums exactly where dollars would drift", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumCents([toCents("0.10"), toCents("0.20")])).toBe(30);
  });

  it("formats for display", () => {
    expect(formatCents(5000)).toBe("$50.00");
    expect(formatCents(123456)).toBe("$1,234.56");
  });
});
