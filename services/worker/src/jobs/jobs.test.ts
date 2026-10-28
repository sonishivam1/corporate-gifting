import { createLogger } from "@gifting/logger";
import { describe, expect, it } from "vitest";

import { JOBS } from "./index";

describe("job registry", () => {
  it("has the nine jobs in docs/architecture/overview.md", () => {
    expect(JOBS.map((j) => j.name)).toEqual([
      "campaign-send",
      "milestone-automation",
      "reminders",
      "expiry",
      "stuck-claim-reconciler",
      "ledger-reconciliation",
      "statements",
      "ct-events",
      "hr-sync",
    ]);
  });

  it("gives every job a valid schedule", () => {
    for (const job of JOBS) {
      const ok = job.schedule === "continuous" || job.schedule.split(" ").length === 5;
      expect(ok, job.name).toBe(true);
    }
  });

  it("lets planned jobs run without doing anything", async () => {
    const log = createLogger("worker");
    for (const job of JOBS) await expect(job.run({ log, now: new Date() })).resolves.toBeUndefined();
  });
});
