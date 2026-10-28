import { describe, expect, it } from "vitest";

import {
  assertTransition,
  canTransition,
  CLAIMABLE_STATUSES,
  GIFT_STATUSES,
  HOLDING_STATUSES,
  isTerminal,
  nextStatuses,
} from "./gift-status";

describe("gift state machine", () => {
  it("follows the redemption path", () => {
    const path = ["created", "sent", "opened", "redeeming", "redeemed", "shipped", "delivered"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!), `${path[i]} → ${path[i + 1]}`).toBe(true);
    }
  });

  it("only lets a recipient claim from sent or opened", () => {
    expect(CLAIMABLE_STATUSES).toEqual(["sent", "opened"]);
    for (const status of GIFT_STATUSES) {
      expect(canTransition(status, "redeeming"), status).toBe((CLAIMABLE_STATUSES as readonly string[]).includes(status));
    }
  });

  it("never redeems twice or revives a finished gift", () => {
    expect(canTransition("redeemed", "redeeming")).toBe(false);
    expect(canTransition("redeeming", "redeeming")).toBe(false);
    expect(canTransition("expired", "opened")).toBe(false);
    expect(canTransition("cancelled", "sent")).toBe(false);
    expect(() => assertTransition("delivered", "opened")).toThrow("Gift cannot move from delivered to opened.");
  });

  it("returns a failed claim or a vendor cancellation to opened", () => {
    expect(canTransition("redeeming", "opened")).toBe(true);
    expect(canTransition("redeemed", "opened")).toBe(true);
    expect(canTransition("shipped", "opened")).toBe(false);
  });

  it("can't expire or cancel a gift once it is being redeemed", () => {
    for (const status of ["redeeming", "redeemed", "shipped", "delivered"] as const) {
      expect(canTransition(status, "expired"), status).toBe(false);
      expect(canTransition(status, "cancelled"), status).toBe(false);
    }
  });

  it("marks delivered, expired and cancelled as terminal", () => {
    expect(GIFT_STATUSES.filter(isTerminal)).toEqual(["delivered", "expired", "cancelled"]);
    expect(nextStatuses("delivered")).toEqual([]);
  });

  it("holds money only while a gift can still be redeemed", () => {
    expect(HOLDING_STATUSES).toEqual(["scheduled", "sent", "opened", "redeeming"]);
  });
});
