import { describe, expect, it } from "vitest";

import type { GiftStatus } from "./gift-status";
import { type OverviewGift, overviewFrom, overviewWindow } from "./overview";

const NOW = new Date("2026-10-29T15:00:00Z");
const day = (d: string, time = "10:00:00") => new Date(`${d}T${time}Z`);

function gift(status: GiftStatus, at: Partial<Record<GiftStatus, string>>, expires = "2026-12-31"): OverviewGift {
  const statusAt = Object.fromEntries(Object.entries(at).map(([s, d]) => [s, day(d)]));
  return { status, statusAt, expiresAt: day(expires), createdAt: day(at.sent ?? "2026-10-01") };
}

describe("overview window", () => {
  it("covers the last N days, today included, and the N days before", () => {
    const w = overviewWindow("7d", NOW);
    expect(new Date(w.from).toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(new Date(w.previousFrom).toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(w.previousTo).toBe(w.from);
  });
});

describe("overviewFrom", () => {
  it("counts the gifts sent in the range and those of them where a gift was chosen", () => {
    const o = overviewFrom(
      [
        gift("redeemed", { sent: "2026-10-24", opened: "2026-10-24", redeeming: "2026-10-25" }),
        gift("opened", { sent: "2026-10-25", opened: "2026-10-26" }),
        gift("sent", { sent: "2026-10-29" }),
        gift("delivered", { sent: "2026-10-23", redeeming: "2026-10-23" }),
        // Before the range: not in this cohort, though it was chosen inside the range.
        gift("redeemed", { sent: "2026-10-20", redeeming: "2026-10-24" }),
      ],
      "7d",
      NOW,
    );
    expect(o.sent).toEqual({ count: 4, previous: 1 });
    expect(o.chose).toEqual({ count: 2, rate: 50, previousRate: 100 });
  });

  it("has a rate of 0, not NaN, when nothing was sent", () => {
    expect(overviewFrom([], "30d", NOW).chose).toEqual({ count: 0, rate: 0, previousRate: 0 });
  });

  it("puts each event on its own day, and lists days with no activity", () => {
    const o = overviewFrom([gift("redeemed", { sent: "2026-10-27", opened: "2026-10-28", redeeming: "2026-10-29" })], "7d", NOW);
    expect(o.daily).toHaveLength(7);
    expect(o.daily[0]).toEqual({ date: "2026-10-23", sent: 0, opened: 0, chose: 0 });
    expect(o.daily.slice(4)).toEqual([
      { date: "2026-10-27", sent: 1, opened: 0, chose: 0 },
      { date: "2026-10-28", sent: 0, opened: 1, chose: 0 },
      { date: "2026-10-29", sent: 0, opened: 0, chose: 1 },
    ]);
  });

  it("counts only unchosen gifts whose link expires in the next 7 days", () => {
    const o = overviewFrom(
      [
        gift("sent", { sent: "2026-10-01" }, "2026-11-02"),
        gift("opened", { sent: "2026-10-01" }, "2026-11-05"),
        gift("sent", { sent: "2026-10-01" }, "2026-11-06"),
        gift("redeemed", { sent: "2026-10-01" }, "2026-11-01"),
        gift("sent", { sent: "2026-10-01" }, "2026-10-28"),
      ],
      "30d",
      NOW,
    );
    expect(o.expiringSoon).toBe(2);
  });

  it("groups the cohort by where each gift is now", () => {
    const o = overviewFrom(
      ["sent", "opened", "redeeming", "redeemed", "shipped", "delivered", "expired", "cancelled"].map((s) => gift(s as GiftStatus, { sent: "2026-10-28" })),
      "7d",
      NOW,
    );
    expect(o.statuses).toEqual({ waiting: 1, opened: 1, chose: 2, shipped: 1, delivered: 1, expired: 1 });
  });

  it("uses the creation date for gifts made before status dates existed, and never counts gifts that didn't go out", () => {
    const old: OverviewGift = { status: "opened", expiresAt: day("2026-12-01"), createdAt: day("2026-10-28") };
    const waiting: OverviewGift = { status: "pending_approval", expiresAt: day("2026-12-01"), createdAt: day("2026-10-28") };
    expect(overviewFrom([old, waiting], "7d", NOW).sent.count).toBe(1);
  });
});
