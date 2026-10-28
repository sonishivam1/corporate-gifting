import { describe, expect, it } from "vitest";

import { canCover, computeBalance } from "./balance";
import {
  adjustmentEntry,
  holdAmount,
  holdEntry,
  redemptionEntries,
  refundEntry,
  releaseEntry,
  topUpEntry,
} from "./entries";

const now = new Date("2026-10-27T10:00:00Z");
const base = { accountId: "acc-people", currency: "USD" as const, now, createdBy: "system" };
const gift = (giftId: string, holdNo = 1) => ({ ...base, giftId, campaignId: "c1", holdNo });

// The worked example in docs/architecture/money-and-ledger.md.
const hold = holdAmount({ budgetCents: 5000, shippingAllowanceCents: 1000, taxEstimateCents: 500, feeCents: 300 });
const funded = [topUpEntry({ ...base, amountCents: 100_000, paymentRef: "pi_1" })];

describe("hold amount", () => {
  it("is budget + shipping allowance + tax estimate + fee", () => {
    expect(hold).toBe(6800);
  });
});

describe("balance through a gift's life", () => {
  it("drops by the hold when a gift is held", () => {
    const b = computeBalance([...funded, holdEntry({ ...gift("g1"), holdCents: hold })]);
    expect(b.available).toBe(93_200);
    expect(b.openHolds).toBe(6800);
  });

  it("nets a redeemed gift to exactly capture + fee", () => {
    const entries = [
      ...funded,
      holdEntry({ ...gift("g1"), holdCents: hold }),
      ...redemptionEntries({ ...gift("g1"), holdCents: hold, captureCents: 5300, feeCents: 300 }),
    ];
    const b = computeBalance(entries);
    expect(b.openHolds).toBe(0);
    expect(b.captured).toBe(5300);
    expect(b.fees).toBe(300);
    expect(b.available).toBe(100_000 - 5300 - 300);
  });

  it("nets an expired gift to zero", () => {
    const entries = [...funded, holdEntry({ ...gift("g1"), holdCents: hold }), releaseEntry({ ...gift("g1"), holdCents: hold })];
    expect(computeBalance(entries).available).toBe(100_000);
  });

  it("refunds a vendor cancellation and re-holds with fresh keys", () => {
    const entries = [
      ...funded,
      holdEntry({ ...gift("g1"), holdCents: hold }),
      ...redemptionEntries({ ...gift("g1"), holdCents: hold, captureCents: 5300, feeCents: 300 }),
      refundEntry({ ...gift("g1"), capturedCents: 5300 }),
      holdEntry({ ...gift("g1", 2), holdCents: hold }),
    ];
    const b = computeBalance(entries);
    expect(b.refunded).toBe(5300);
    expect(b.openHolds).toBe(6800);
    // The fee stays charged; the capture came back; a new hold is open.
    expect(b.available).toBe(100_000 - 300 - 6800);
  });

  it("counts the credit limit of an invoice-billed account", () => {
    const b = computeBalance([holdEntry({ ...gift("g1"), holdCents: hold })], 50_000);
    expect(b.available).toBe(50_000 - 6800);
    expect(canCover(b, 43_200)).toBe(true);
    expect(canCover(b, 43_201)).toBe(false);
  });

  it("applies adjustments in their own direction", () => {
    const entries = [
      ...funded,
      adjustmentEntry({ ...base, adjustmentId: "a1", amountCents: 1000, direction: "debit", reason: "duplicate top-up" }),
      adjustmentEntry({ ...base, adjustmentId: "a2", amountCents: 250, direction: "credit", reason: "goodwill" }),
    ];
    expect(computeBalance(entries).available).toBe(100_000 - 1000 + 250);
  });
});

describe("exactly once", () => {
  it("counts a retried entry once", () => {
    const capture = redemptionEntries({ ...gift("g1"), holdCents: hold, captureCents: 5300, feeCents: 300 });
    const once = computeBalance([...funded, holdEntry({ ...gift("g1"), holdCents: hold }), ...capture]);
    const twice = computeBalance([...funded, holdEntry({ ...gift("g1"), holdCents: hold }), ...capture, ...capture]);
    expect(twice).toEqual(once);
  });

  it("builds the same keys on a retry", () => {
    const a = redemptionEntries({ ...gift("g1"), holdCents: hold, captureCents: 5300, feeCents: 300 });
    const b = redemptionEntries({ ...gift("g1"), holdCents: hold, captureCents: 5300, feeCents: 300 });
    expect(a.map((e) => e.idempotencyKey)).toEqual(["release:g1:1", "capture:g1:1", "fee:g1:1"]);
    expect(b.map((e) => e.idempotencyKey)).toEqual(a.map((e) => e.idempotencyKey));
  });

  it("nets any mix of gifts correctly", () => {
    // 20 gifts: every third expires, the rest redeem at varying costs.
    const entries = [...funded];
    let expected = 100_000;
    for (let i = 0; i < 20; i++) {
      const g = gift(`g${i}`);
      entries.push(holdEntry({ ...g, holdCents: hold }));
      if (i % 3 === 0) {
        entries.push(releaseEntry({ ...g, holdCents: hold }));
      } else {
        const capture = 3000 + i * 100;
        entries.push(...redemptionEntries({ ...g, holdCents: hold, captureCents: capture, feeCents: 300 }));
        expected -= capture + 300;
      }
    }
    const b = computeBalance(entries);
    expect(b.openHolds).toBe(0);
    expect(b.available).toBe(expected);
  });
});

describe("guards", () => {
  it("refuses a capture and fee above the hold", () => {
    expect(() => redemptionEntries({ ...gift("g1"), holdCents: hold, captureCents: 6600, feeCents: 300 })).toThrow(
      "Capture and fee exceed the hold.",
    );
  });

  it("refuses zero amounts and adjustments without a reason", () => {
    expect(() => topUpEntry({ ...base, amountCents: 0, paymentRef: "pi_0" })).toThrow(RangeError);
    expect(() =>
      adjustmentEntry({ ...base, adjustmentId: "a1", amountCents: 100, direction: "credit", reason: "  " }),
    ).toThrow("An adjustment needs a reason.");
  });
});
