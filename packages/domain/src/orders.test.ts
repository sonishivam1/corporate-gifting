import { describe, expect, it } from "vitest";

import { estimateExtraCents } from "./orders";

describe("estimateExtraCents", () => {
  it("is the percent of the budget", () => {
    expect(estimateExtraCents(5000, 25)).toBe(1250);
    expect(estimateExtraCents(4500, 10)).toBe(450);
  });

  it("rounds up so the estimate is never short by a cent", () => {
    expect(estimateExtraCents(1, 10)).toBe(1);
    expect(estimateExtraCents(333, 10)).toBe(34);
  });

  it("is nothing at 0 percent", () => {
    expect(estimateExtraCents(5000, 0)).toBe(0);
  });

  it("refuses a bad budget or percent", () => {
    expect(() => estimateExtraCents(-1, 10)).toThrow(RangeError);
    expect(() => estimateExtraCents(100, -1)).toThrow(RangeError);
    expect(() => estimateExtraCents(100, 101)).toThrow(RangeError);
    expect(() => estimateExtraCents(100, Number.NaN)).toThrow(RangeError);
  });
});
