/**
 * The sender Home's numbers (plan: sender-home-redesign.md), counted from a
 * team's gifts. Pure: the API reads the gifts and passes them in.
 *
 * - A range is the last N days, today included, in UTC. The previous range
 *   is the N days before it, for the changes on the stat cards.
 * - "Sent" and "chose" are a cohort: the gifts sent in the range, and how
 *   many of those have had a gift chosen. So the rate never passes 100%.
 * - The daily chart counts events on the day they happened: sent, opened,
 *   chose a gift.
 * - The status breakdown is the cohort's gifts by where they are now.
 */
import { z } from "zod";

import type { GiftStatus } from "./gift-status";
import type { Gift } from "./models";

export const OVERVIEW_RANGES = ["7d", "30d", "90d"] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];
const DAYS: Record<OverviewRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** Links expiring within this window count as "expiring soon". */
export const EXPIRING_SOON_DAYS = 7;
const DAY = 86_400_000;

/** Where a sent gift is now, as the Home's donut shows it. */
export const OVERVIEW_STATUSES = ["waiting", "opened", "chose", "shipped", "delivered", "expired"] as const;
export type OverviewStatus = (typeof OVERVIEW_STATUSES)[number];

const GROUP: Partial<Record<GiftStatus, OverviewStatus>> = {
  sent: "waiting",
  opened: "opened",
  redeeming: "chose",
  redeemed: "chose",
  shipped: "chose",
  delivered: "chose",
  expired: "expired",
};
// Shipped and delivered gifts were chosen too; the donut shows them on their own.
const DONUT: Partial<Record<GiftStatus, OverviewStatus>> = { ...GROUP, shipped: "shipped", delivered: "delivered" };
/** Statuses that come after the gift went out (cancelled is left out: it may never have gone). */
const WENT_OUT = new Set<GiftStatus>(Object.keys(GROUP) as GiftStatus[]);

export type OverviewGift = Pick<Gift, "status" | "statusAt" | "expiresAt" | "createdAt">;

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** When the gift went out. Gifts made before status dates existed fall back to when they were created. */
function sentAt(g: OverviewGift): number | null {
  const at = g.statusAt?.sent ?? (WENT_OUT.has(g.status) ? g.createdAt : null);
  return at ? at.getTime() : null;
}
const choseAt = (g: OverviewGift) => (g.statusAt?.redeeming ?? g.statusAt?.redeemed)?.getTime() ?? null;
const openedAt = (g: OverviewGift) => g.statusAt?.opened?.getTime() ?? null;

export function overviewWindow(range: OverviewRange, now: Date) {
  const days = DAYS[range];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const from = today - (days - 1) * DAY;
  return { days, from, to: now.getTime(), previousFrom: from - days * DAY, previousTo: from };
}

export function overviewFrom(gifts: readonly OverviewGift[], range: OverviewRange, now: Date) {
  const w = overviewWindow(range, now);
  // Gifts sent from `from` up to, but not including, `end`.
  const cohort = (from: number, end: number) =>
    gifts.filter((g) => {
      const t = sentAt(g);
      return t !== null && t >= from && t < end;
    });
  const chose = (list: readonly OverviewGift[]) => list.filter((g) => GROUP[g.status] === "chose").length;
  const rate = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));

  const current = cohort(w.from, w.to + 1);
  const previous = cohort(w.previousFrom, w.previousTo);

  const daily = Array.from({ length: w.days }, (_, i) => ({ date: isoDay(w.from + i * DAY), sent: 0, opened: 0, chose: 0 }));
  const bump = (t: number | null, key: "sent" | "opened" | "chose") => {
    if (t === null || t < w.from || t > w.to) return;
    const row = daily[Math.floor((t - w.from) / DAY)];
    if (row) row[key] += 1;
  };
  for (const g of gifts) {
    bump(sentAt(g), "sent");
    bump(openedAt(g), "opened");
    bump(choseAt(g), "chose");
  }

  const statuses = Object.fromEntries(OVERVIEW_STATUSES.map((s) => [s, 0])) as Record<OverviewStatus, number>;
  for (const g of current) {
    const group = DONUT[g.status];
    if (group) statuses[group] += 1;
  }

  const soon = w.to + EXPIRING_SOON_DAYS * DAY;
  const expiringSoon = gifts.filter((g) => (g.status === "sent" || g.status === "opened") && g.expiresAt.getTime() > w.to && g.expiresAt.getTime() <= soon).length;

  const choseNow = chose(current);
  const chosePrevious = chose(previous);
  return {
    range: {
      from: new Date(w.from).toISOString(),
      to: new Date(w.to).toISOString(),
      previousFrom: new Date(w.previousFrom).toISOString(),
      previousTo: new Date(w.previousTo).toISOString(),
    },
    sent: { count: current.length, previous: previous.length },
    chose: { count: choseNow, rate: rate(choseNow, current.length), previousRate: rate(chosePrevious, previous.length) },
    expiringSoon,
    daily,
    statuses,
  };
}

export const overviewView = z.object({
  range: z.object({ from: z.string(), to: z.string(), previousFrom: z.string(), previousTo: z.string() }),
  balance: z.object({
    currency: z.string(),
    availableCents: z.number().int(),
    heldCents: z.number().int(),
    spentCents: z.number().int(),
  }),
  sent: z.object({ count: z.number().int(), previous: z.number().int() }),
  chose: z.object({ count: z.number().int(), rate: z.number().int(), previousRate: z.number().int() }),
  expiringSoon: z.number().int(),
  pendingApprovals: z.number().int(),
  daily: z.array(z.object({ date: z.string(), sent: z.number().int(), opened: z.number().int(), chose: z.number().int() })),
  statuses: z.object(Object.fromEntries(OVERVIEW_STATUSES.map((s) => [s, z.number().int()])) as Record<OverviewStatus, z.ZodNumber>),
});
export type OverviewView = z.infer<typeof overviewView>;
