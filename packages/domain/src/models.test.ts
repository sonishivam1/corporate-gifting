import { describe, expect, it } from "vitest";

import { gift, ledgerEntry } from "./models";

const now = new Date("2026-10-27T10:00:00Z");
const hash = "a".repeat(64);

const validGift = {
  _id: "g1",
  companyKey: "company-acme",
  teamKey: "team-people",
  campaignId: "c1",
  recipientId: "r1",
  occurrence: "once",
  budgetCents: 5000,
  holdCents: 6800,
  holdNo: 1,
  tokenHash: hash,
  codeHash: hash,
  status: "sent",
  version: 0,
  expiresAt: now,
  claim: null,
  notifications: [],
  ctOrderNumber: null,
  createdAt: now,
  updatedAt: now,
};

describe("models", () => {
  it("accept a valid gift", () => {
    expect(gift.parse(validGift)).toEqual(validGift);
  });

  it("refuse money as floats", () => {
    expect(gift.safeParse({ ...validGift, budgetCents: 50.5 }).success).toBe(false);
  });

  it("refuse a raw token in place of its hash", () => {
    expect(gift.safeParse({ ...validGift, tokenHash: "short-token" }).success).toBe(false);
  });

  it("refuse an unknown status", () => {
    expect(gift.safeParse({ ...validGift, status: "lost" }).success).toBe(false);
  });

  it("refuse zero or negative ledger amounts", () => {
    const entry = {
      _id: "e1",
      accountId: "a1",
      type: "hold",
      direction: null,
      amountCents: 6800,
      currency: "USD",
      giftId: "g1",
      campaignId: "c1",
      idempotencyKey: "hold:g1:1",
      reason: null,
      createdAt: now,
      createdBy: "system",
    };
    expect(ledgerEntry.safeParse(entry).success).toBe(true);
    expect(ledgerEntry.safeParse({ ...entry, amountCents: 0 }).success).toBe(false);
    expect(ledgerEntry.safeParse({ ...entry, amountCents: -100 }).success).toBe(false);
  });
});
