/**
 * Zod schemas for the eight MongoDB collections: the single source of truth
 * for their shape (ADR 0002, ADR 0003). Anything commercetools models
 * (companies, teams, vendors, products, orders, addresses, shipments) is
 * referenced by key here, never copied.
 *
 * Ids are strings (UUIDs), so these schemas stay free of the MongoDB driver
 * and can be imported by the apps.
 */
import { z } from "zod";

import { GIFT_STATUSES } from "./gift-status";
import { CURRENCIES } from "./money";

const id = z.string().min(1);
const key = z.string().min(1).max(256);
const centsField = z.number().int().nonnegative();
const currency = z.enum(CURRENCIES);
const monthDay = z.string().regex(/^\d{2}-\d{2}$/, "MM-DD");

export const CHANNEL_KINDS = ["email", "sms", "slack", "teams", "link", "qr"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];
export const channelKind = z.enum(CHANNEL_KINDS);

export const OCCASIONS = ["holiday", "anniversary", "birthday", "thanks", "newhire", "appreciation"] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const CARD_COVERS = ["confetti", "ribbon", "evergreen", "brand"] as const;
export type CardCover = (typeof CARD_COVERS)[number];

// accounts: one budget account per team. The balance is computed from the ledger, never stored.
export const budgetAccount = z.object({
  _id: id,
  companyKey: key,
  teamKey: key,
  currency,
  billingMethod: z.enum(["prepaid", "invoice"]),
  creditLimitCents: centsField,
  stripeCustomerId: z.string().nullable(),
  // Touched by every transaction that places holds, so two concurrent holds on
  // one account conflict and the second retries against the new balance.
  holdsUpdatedAt: z.date().nullable(),
  createdAt: z.date(),
});
export type BudgetAccount = z.infer<typeof budgetAccount>;

export const LEDGER_ENTRY_TYPES = ["top-up", "hold", "release", "capture", "fee", "refund", "adjustment"] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

// ledgerEntries: append-only. Amounts are positive; the type gives the direction
// (adjustments carry their own).
export const ledgerEntry = z.object({
  _id: id,
  accountId: id,
  type: z.enum(LEDGER_ENTRY_TYPES),
  direction: z.enum(["credit", "debit"]).nullable(),
  amountCents: z.number().int().positive(),
  currency,
  giftId: id.nullable(),
  campaignId: id.nullable(),
  idempotencyKey: z.string().min(1),
  reason: z.string().max(500).nullable(),
  createdAt: z.date(),
  createdBy: z.string().min(1),
});
export type LedgerEntry = z.infer<typeof ledgerEntry>;

// collections: rules resolved through commercetools product search.
export const giftCollection = z.object({
  _id: id,
  owner: z.union([z.literal("platform"), key]),
  name: z.string().min(1).max(120),
  rules: z.object({
    tags: z.array(z.string()),
    brands: z.array(z.string()),
    skus: z.array(z.string()),
    pinnedSkus: z.array(z.string()),
  }),
  countries: z.array(z.string().length(2)).min(1),
  budgetBandCents: centsField,
  // Company collections (build-your-own-collection.md): who built and last
  // changed it, and when it was archived. Archived collections are hidden
  // from lists and new campaigns, but gifts already sent still read them.
  createdBy: z.string().nullable().optional(),
  updatedBy: z.string().nullable().optional(),
  archivedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type GiftCollection = z.infer<typeof giftCollection>;

// recipients: personal fields are encrypted at rest (M5) and purged after retention.
export const recipient = z.object({
  _id: id,
  companyKey: key,
  teamKey: key.nullable(),
  name: z.string().min(1),
  email: z.string().email().nullable(),
  emailLower: z.string().nullable(),
  phone: z.string().nullable(),
  slackId: z.string().nullable(),
  teamsId: z.string().nullable(),
  birthdayMonthDay: monthDay.nullable(),
  startDate: z.date().nullable(),
  startMonthDay: monthDay.nullable(),
  source: z.enum(["manual", "csv", "hris"]),
  externalId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Recipient = z.infer<typeof recipient>;

export const CAMPAIGN_TYPES = ["one-time", "scheduled", "automated"] as const;
export const CAMPAIGN_STATUSES = ["draft", "pending_approval", "approved", "sending", "active", "completed", "cancelled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const campaign = z.object({
  _id: id,
  companyKey: key,
  teamKey: key,
  name: z.string().min(1).max(120),
  type: z.enum(CAMPAIGN_TYPES),
  status: z.enum(CAMPAIGN_STATUSES),
  collectionId: id.nullable(),
  sku: z.string().nullable(),
  budgetCents: centsField,
  channels: z.array(channelKind).min(1),
  branding: z.object({ brandColor: z.string().nullable(), logoUrl: z.string().url().nullable() }),
  greeting: z.object({
    occasion: z.enum(OCCASIONS),
    cover: z.enum(CARD_COVERS),
    headline: z.string().min(1).max(40),
    fromName: z.string().min(1).max(40),
  }),
  message: z.string().max(2000),
  // The people a one-time or scheduled campaign goes to; gifts are created from them at submit.
  recipientIds: z.array(id).max(500),
  reminders: z.boolean(),
  expiresInDays: z.number().int().min(1).max(365),
  sendAt: z.date().nullable(),
  approval: z
    .object({
      required: z.boolean(),
      approverId: z.string().nullable(),
      decidedAt: z.date().nullable(),
      decision: z.enum(["approved", "rejected"]).nullable(),
    })
    .nullable(),
  trigger: z
    .object({
      kind: z.enum(["birthday", "work-anniversary", "start-date"]),
      daysBefore: z.number().int().min(0).max(30),
    })
    .nullable(),
  createdBy: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Campaign = z.infer<typeof campaign>;

export const giftClaim = z.object({
  sku: z.string().min(1),
  idempotencyKey: z.string().min(1),
  status: z.enum(["pending", "ordered", "failed"]),
  startedAt: z.date(),
  failureCode: z.string().nullable(),
});

export const giftNotification = z.object({
  channel: channelKind,
  kind: z.enum(["send", "reminder"]),
  reminderNo: z.number().int().nonnegative(),
  providerMessageId: z.string().nullable(),
  // sending: claimed by one deliverer, so two workers never send the same message.
  status: z.enum(["queued", "sending", "sent", "delivered", "failed"]),
  at: z.date(),
});

export const gift = z.object({
  _id: id,
  companyKey: key,
  teamKey: key,
  campaignId: id,
  recipientId: id,
  // "once" for one-time and scheduled campaigns; the milestone date for automated ones.
  occurrence: z.string().min(1),
  budgetCents: centsField,
  holdCents: centsField,
  holdNo: z.number().int().nonnegative(),
  tokenHash: z.string().length(64),
  codeHash: z.string().length(64),
  status: z.enum(GIFT_STATUSES),
  // When the gift reached each status, written with the change (the overview's dates). Older gifts have none.
  statusAt: z.partialRecord(z.enum(GIFT_STATUSES), z.date()).optional(),
  version: z.number().int().nonnegative(),
  expiresAt: z.date(),
  claim: giftClaim.nullable(),
  notifications: z.array(giftNotification),
  ctOrderNumber: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Gift = z.infer<typeof gift>;

export const integration = z.object({
  _id: id,
  companyKey: key,
  type: z.enum(["hris", "slack", "teams"]),
  status: z.enum(["pending", "connected", "error", "disconnected"]),
  // A reference into the secrets manager, never the secret.
  secretRef: z.string().nullable(),
  lastSyncAt: z.date().nullable(),
  updatedAt: z.date(),
});
export type Integration = z.infer<typeof integration>;

// processedEvents: _id is the commercetools message id; TTL 30 days.
export const processedEvent = z.object({
  _id: z.string().min(1),
  receivedAt: z.date(),
});
export type ProcessedEvent = z.infer<typeof processedEvent>;
