import { describe, expect, it } from "vitest";

import { dbConfig } from "./client";
import { COLLECTIONS } from "./collections";
import { INDEXES } from "./indexes";
import { assertTestDb, testDbName } from "./test-db";

const uniqueKeys = (collection: keyof typeof INDEXES) =>
  INDEXES[collection].filter((i) => i.unique).map((i) => Object.keys(i.key).join("+"));

describe("collections", () => {
  it("are exactly the nine in ADR 0002 and ADR 0017", () => {
    expect(Object.values(COLLECTIONS).sort()).toEqual(
      ["accounts", "campaigns", "collections", "gifts", "integrations", "invitations", "ledgerEntries", "processedEvents", "recipients"],
    );
    expect(Object.keys(INDEXES).sort()).toEqual(Object.values(COLLECTIONS).sort());
  });
});

describe("exactly-once indexes", () => {
  it("make ledger idempotency keys unique", () => {
    expect(uniqueKeys("ledgerEntries")).toEqual(["idempotencyKey"]);
  });

  it("make gift tokens, codes and occurrences unique", () => {
    expect(uniqueKeys("gifts")).toEqual(["tokenHash", "codeHash", "campaignId+recipientId+occurrence"]);
  });

  it("make invitation links unique, and one pending invitation per person, team and role", () => {
    expect(uniqueKeys("invitations")).toEqual(["tokenHash", "companyKey+emailLower+teamKey+role"]);
    const pending = INDEXES.invitations.find((i) => i.name === "pending_company_email_team_role_unique");
    expect(pending?.partialFilterExpression).toEqual({ status: "pending" });
  });

  it("expire processed events after 30 days", () => {
    expect(INDEXES.processedEvents[0]?.expireAfterSeconds).toBe(2_592_000);
  });

  it("lead with the company or team on company-scoped lookups", () => {
    for (const collection of ["recipients", "integrations"] as const) {
      for (const index of INDEXES[collection]) {
        expect(Object.keys(index.key)[0], `${collection}.${index.name}`).toBe("companyKey");
      }
    }
  });
});

describe("test database guard", () => {
  it("allows only gifting_test_* names", () => {
    expect(() => assertTestDb(testDbName())).not.toThrow();
    expect(() => assertTestDb("gifting")).toThrow("Refusing");
    expect(() => assertTestDb("gifting_prod")).toThrow("Refusing");
    expect(() => assertTestDb("test_gifting")).toThrow("Refusing");
  });

  it("gives every test file its own name", () => {
    expect(testDbName()).toMatch(/^gifting_test_\d+_[0-9a-f]{6}$/);
    expect(testDbName()).not.toBe(testDbName());
  });
});

describe("config", () => {
  it("names a missing variable without echoing values", () => {
    expect(() => dbConfig({})).toThrow("MONGODB_URI");
    expect(dbConfig({ MONGODB_URI: "mongodb://localhost:27017" })).toEqual({
      uri: "mongodb://localhost:27017",
      dbName: "gifting",
    });
  });
});
