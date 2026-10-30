import { canTransition, type GiftStatus } from "@gifting/domain";
import { describe, expect, it } from "vitest";

import { demoActivity, journey } from "./write-activity";

describe("demo activity", () => {
  const all = demoActivity.flatMap((d) => Array.from({ length: d.recipients }, (_, i) => ({ d, ...journey(i, d.daysAgo, d.expiresInDays) })));

  it("never dates a stage in the future", () => {
    for (const { d, status, hours } of all) {
      for (const [stage, h] of Object.entries(hours)) {
        if (stage !== "expired") expect(h!, `${d.key} ${status} ${stage}`).toBeLessThan(d.daysAgo * 24);
      }
    }
  });

  it("goes through the stages in an order the gift state machine allows", () => {
    for (const { d, hours } of all) {
      const path = (Object.entries(hours) as [GiftStatus, number][]).sort((a, b) => a[1] - b[1]).map(([s]) => s);
      for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1]!, path[i]!), `${d.key}: ${path.join(" → ")}`).toBe(true);
    }
  });

  it("covers every stage the Home shows", () => {
    expect(new Set(all.map((g) => g.status))).toEqual(new Set(["sent", "opened", "redeemed", "shipped", "delivered", "expired"]));
  });
});
