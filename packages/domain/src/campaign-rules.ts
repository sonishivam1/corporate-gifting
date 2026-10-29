/**
 * Campaign rules shared by the API and the sender app: what a send costs,
 * whether it needs approval, how it is delivered and how its gifts count.
 * The API is the authority; the app uses the same rules only to show a
 * preview before it asks.
 */
import type { GiftStatus } from "./gift-status";
import type { CampaignStatus, ChannelKind, Occasion } from "./models";
import type { Cents } from "./money";

export const OCCASION_LABELS: Record<Occasion, string> = {
  holiday: "Holiday",
  anniversary: "Work anniversary",
  birthday: "Birthday",
  thanks: "Thank you",
  newhire: "New hire",
  appreciation: "Appreciation",
};

export const EXPIRY_DAYS = [30, 60, 90] as const;

export type SendEstimate = {
  gifts: number;
  holdCents: Cents;
  totalCents: Cents;
  availableCents: Cents;
  afterCents: number;
  needsApproval: boolean;
  short: boolean;
  shortByCents: Cents;
};

/**
 * The cost of a send: one hold per gift. Above the team's threshold it needs
 * an approver (equal to the threshold does not). Short means the team can't
 * cover the holds now; nothing is held or sent.
 */
export function estimateSend(input: {
  gifts: number;
  holdCents: Cents;
  availableCents: Cents;
  approvalThresholdCents: Cents;
}): SendEstimate {
  if (!Number.isSafeInteger(input.gifts) || input.gifts < 0) throw new RangeError("gifts must be a non-negative integer.");
  const totalCents = input.gifts * input.holdCents;
  const afterCents = input.availableCents - totalCents;
  return {
    gifts: input.gifts,
    holdCents: input.holdCents,
    totalCents,
    availableCents: input.availableCents,
    afterCents,
    needsApproval: totalCents > input.approvalThresholdCents,
    short: afterCents < 0,
    shortByCents: Math.max(0, -afterCents),
  };
}

const DIRECT_CHANNELS: readonly ChannelKind[] = ["email", "sms", "slack", "teams"];

/**
 * The channel a gift is delivered on: the first direct channel picked, else
 * a link or QR code the sender hands out.
 */
export function deliveryChannel(channels: readonly ChannelKind[]): ChannelKind {
  const channel = channels.find((c) => DIRECT_CHANNELS.includes(c)) ?? channels[0];
  if (!channel) throw new RangeError("A campaign needs at least one channel.");
  return channel;
}

/** Whether the sender gets links to hand out themselves. */
export function hasShareableLinks(channels: readonly ChannelKind[]): boolean {
  return channels.includes("link") || channels.includes("qr");
}

export type CampaignFunnel = {
  total: number;
  sent: number;
  opened: number;
  chose: number;
  shipped: number;
  delivered: number;
  expired: number;
};

const SENT: readonly GiftStatus[] = ["sent", "opened", "redeeming", "redeemed", "shipped", "delivered", "expired", "cancelled"];
const OPENED: readonly GiftStatus[] = ["opened", "redeeming", "redeemed", "shipped", "delivered"];
const CHOSE: readonly GiftStatus[] = ["redeeming", "redeemed", "shipped", "delivered"];
const SHIPPED: readonly GiftStatus[] = ["shipped", "delivered"];

/** Each stage counts every gift that reached it. Gifts waiting for approval or a send date count only in the total. */
export function campaignFunnel(statuses: readonly GiftStatus[]): CampaignFunnel {
  const count = (stages: readonly GiftStatus[]) => statuses.filter((s) => stages.includes(s)).length;
  return {
    total: statuses.length,
    sent: count(SENT),
    opened: count(OPENED),
    chose: count(CHOSE),
    shipped: count(SHIPPED),
    delivered: count(["delivered"]),
    expired: count(["expired", "cancelled"]),
  };
}

export function addFunnels(funnels: readonly CampaignFunnel[]): CampaignFunnel {
  const total: CampaignFunnel = { total: 0, sent: 0, opened: 0, chose: 0, shipped: 0, delivered: 0, expired: 0 };
  for (const f of funnels) for (const k of Object.keys(total) as (keyof CampaignFunnel)[]) total[k] += f[k];
  return total;
}

export const CAMPAIGN_DISPLAY_STATUSES = ["draft", "pending_approval", "scheduled", "active", "completed", "cancelled"] as const;
export type CampaignDisplayStatus = (typeof CAMPAIGN_DISPLAY_STATUSES)[number];

/** What the sender sees. An approved campaign is waiting for its send date. */
export function campaignDisplayStatus(status: CampaignStatus): CampaignDisplayStatus {
  if (status === "approved") return "scheduled";
  if (status === "sending") return "active";
  return status;
}

/** "Thank you · 28 Oct" when the sender leaves the name empty. */
export function defaultCampaignName(occasion: Occasion, sendDate: Date): string {
  const day = sendDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${OCCASION_LABELS[occasion]} · ${day}`;
}
