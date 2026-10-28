import type { Logger } from "@gifting/logger";

/**
 * Runner-neutral job definitions (ADR 0011): the runner (Agenda, or BullMQ
 * later) only calls `run`. Every job must be idempotent: running it twice
 * changes nothing the second time. Each job moves into its own file in this
 * folder when it is built.
 */
export type JobContext = { log: Logger; now: Date };

export type JobDefinition = {
  name: string;
  /** A cron expression, or "continuous" for consumers. */
  schedule: string;
  description: string;
  milestone: string;
  run(ctx: JobContext): Promise<void>;
};

const notBuilt = (name: string) => async (ctx: JobContext) => {
  ctx.log.warn({ job: name }, "job not built yet");
};

function planned(name: string, schedule: string, milestone: string, description: string): JobDefinition {
  return { name, schedule, milestone, description, run: notBuilt(name) };
}

export const JOBS: readonly JobDefinition[] = [
  planned("campaign-send", "* * * * *", "M3", "Sends each due gift through its channel and records the notification"),
  planned("milestone-automation", "0 6 * * *", "M5", "Creates gifts for upcoming birthdays, anniversaries and start dates"),
  planned("reminders", "0 * * * *", "M3", "Sends due reminders; stops at redemption"),
  planned("expiry", "0 * * * *", "M6", "Expires gifts past expiresAt and releases their holds"),
  planned("stuck-claim-reconciler", "*/5 * * * *", "M4", "Finishes or rolls back claims stuck in redeeming"),
  planned("ledger-reconciliation", "0 * * * *", "M6", "Open holds against live gifts; captures against order totals"),
  planned("statements", "0 2 1 * *", "M6", "One statement per account; invoices for invoice-billed accounts"),
  planned("ct-events", "continuous", "M4", "Consumes commercetools events; dedupes; routes orders; mirrors shipment status"),
  planned("hr-sync", "0 3 * * *", "M5", "Syncs the recipient directory from the HR system"),
];
