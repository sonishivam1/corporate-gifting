import type { OverviewRange } from "@gifting/domain";

/** The Home's date ranges. Kept out of the client picker, so server pages can read them too. */
export const RANGE_LABELS: Record<OverviewRange, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" };
