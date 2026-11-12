/**
 * The shapes the Gifting API takes and returns, shared with the apps so
 * their types can't drift from the routes (ADR 0010). Dates travel as ISO
 * strings; money as integer cents.
 */
import { z } from "zod";

import { CAMPAIGN_DISPLAY_STATUSES, EXPIRY_DAYS } from "./campaign-rules";
import { GIFT_STATUSES } from "./gift-status";
import { MEMBER_ROLES } from "./members";
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES, CARD_COVERS, CHANNEL_KINDS, OCCASIONS } from "./models";
import { CURRENCIES } from "./money";
import { ACTIONS } from "./permissions";
import { MAX_UPLOAD_ROWS, uploadRow } from "./recipient-upload";

const cents = z.number().int().nonnegative();
const signedCents = z.number().int();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const PRODUCT_CATEGORIES = ["food", "home", "drink", "outdoors"] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

const member = z.object({ id: z.string(), name: z.string(), role: z.enum(MEMBER_ROLES) });

export const meView = z.object({
  // `role` is the highest of `roles`: the roles that apply on the current team (ADR 0016).
  user: member.extend({ roles: z.array(z.enum(MEMBER_ROLES)) }),
  company: z.object({ key: z.string(), name: z.string() }),
  // Every company the person belongs to (the company switcher).
  companies: z.array(z.object({ key: z.string(), name: z.string() })),
  // What the person may do on the current team; the apps hide the rest.
  actions: z.array(z.enum(ACTIONS)),
  team: z.object({
    key: z.string(),
    name: z.string(),
    approvalThresholdCents: cents,
    approverNames: z.array(z.string()),
  }),
  teams: z.array(z.object({ key: z.string(), name: z.string() })),
  // Always null: the development "Viewing as" picker was removed (12 Nov 2026). Kept because v1 changes only add.
  devUsers: z.array(member).nullable(),
});
export type MeView = z.infer<typeof meView>;

export const balanceView = z.object({
  teamKey: z.string(),
  currency: z.enum(CURRENCIES),
  availableCents: signedCents,
  heldCents: cents,
  spentCents: cents,
});
export type BalanceView = z.infer<typeof balanceView>;

/** One orderable version of a product (a size, flavour or colour). A send picks a variant by SKU. */
export const variantView = z.object({
  sku: z.string(),
  // What tells it apart from the product's other variants; empty when it is the only one.
  label: z.string(),
  priceCents: cents,
  available: z.boolean(),
  imageUrl: z.string().nullable(),
});
export type VariantView = z.infer<typeof variantView>;

/**
 * A product as one card. `sku`, `priceCents`, `available` and `imageUrl`
 * describe its default variant: the cheapest available one (see
 * `withVariants`).
 */
export const productView = z.object({
  key: z.string(),
  sku: z.string(),
  name: z.string(),
  brand: z.string(),
  description: z.string(),
  category: z.enum(PRODUCT_CATEGORIES),
  occasions: z.array(z.enum(OCCASIONS)),
  tags: z.array(z.string()),
  vendorKey: z.string(),
  vendorName: z.string(),
  slaDays: z.number().int().positive(),
  priceCents: cents,
  currency: z.enum(CURRENCIES),
  available: z.boolean(),
  imageUrl: z.string().nullable(),
  variants: z.array(variantView).min(1),
});
export type ProductView = z.infer<typeof productView>;

export const productQuery = z.object({
  budget: z.coerce.number().int().positive().optional(),
  occasion: z.enum(OCCASIONS).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  q: z.string().trim().max(80).optional(),
});
export type ProductQuery = z.infer<typeof productQuery>;

export const collectionView = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  budgetBandCents: cents,
  rules: z.object({
    tags: z.array(z.string()),
    brands: z.array(z.string()),
    skus: z.array(z.string()),
    pinnedSkus: z.array(z.string()),
  }),
  // Items that fit the requested budget (the band when none is given).
  itemCount: z.number().int().nonnegative(),
  brandCount: z.number().int().nonnegative(),
  previewCategories: z.array(z.enum(PRODUCT_CATEGORIES)),
});
export type CollectionView = z.infer<typeof collectionView>;

export const recipientView = z.object({ id: z.string(), name: z.string(), email: z.string().nullable() });
export type RecipientView = z.infer<typeof recipientView>;

/** The most people one directory listing returns; `more` says there are others to search for. */
export const DIRECTORY_PAGE = 500;
export const recipientListView = z.object({ recipients: z.array(recipientView), more: z.boolean() });
export type RecipientListView = z.infer<typeof recipientListView>;

/** A recipient list from a file (plan: recipient-upload.md). The rows are checked again here. */
export const recipientImportInput = z.object({ rows: z.array(uploadRow).min(1).max(MAX_UPLOAD_ROWS) });
export type RecipientImportInput = z.input<typeof recipientImportInput>;

export const recipientImportView = z.object({
  // Everyone in the list, in file order: new people and those already in the directory.
  recipients: z.array(recipientView),
  added: z.number().int().nonnegative(),
  existing: z.number().int().nonnegative(),
});
export type RecipientImportView = z.infer<typeof recipientImportView>;

const greeting = z.object({
  occasion: z.enum(OCCASIONS),
  cover: z.enum(CARD_COVERS),
  headline: z.string().trim().min(1).max(40),
  fromName: z.string().trim().min(1).max(40),
});

/** A bundle sends every item to each recipient: 2 to 5 different products (plan: gift-bundles.md). */
export const BUNDLE_LIMITS = { min: 2, max: 5 } as const;

export const sendInput = z.object({
  name: z.string().trim().max(120).default(""),
  gift: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("collection"), collectionId: z.string().min(1), budgetCents: z.number().int().positive() }),
    z.object({ kind: z.literal("single"), sku: z.string().min(1) }),
    z.object({
      kind: z.literal("bundle"),
      skus: z
        .array(z.string().min(1))
        .min(BUNDLE_LIMITS.min, `Pick at least ${BUNDLE_LIMITS.min} gifts for a bundle.`)
        .max(BUNDLE_LIMITS.max, `A bundle has up to ${BUNDLE_LIMITS.max} gifts.`)
        .refine((s) => new Set(s).size === s.length, "A gift is in the bundle twice."),
    }),
  ]),
  greeting,
  message: z.string().trim().min(1).max(500),
  recipientIds: z.array(z.string().min(1)).max(500),
  newEmails: z.array(z.string().trim().toLowerCase().pipe(z.email())).max(100).default([]),
  channels: z.array(z.enum(CHANNEL_KINDS)).min(1).refine((c) => new Set(c).size === c.length, "Channels repeat."),
  sendAt: isoDate.nullable(),
  expiresInDays: z.union(EXPIRY_DAYS.map((d) => z.literal(d)) as [z.ZodLiteral<30>, z.ZodLiteral<60>, z.ZodLiteral<90>]),
  reminders: z.boolean(),
});
/** What the app sends. */
export type SendInput = z.input<typeof sendInput>;
/** What the API works with after parsing (defaults filled in). */
export type SendRequest = z.output<typeof sendInput>;

export const estimateView = z.object({
  gifts: z.number().int().nonnegative(),
  holdCents: cents,
  /** Part of each hold that is an estimate for shipping and tax, settled for the real cost at redemption. */
  estimateCents: cents,
  totalCents: cents,
  availableCents: signedCents,
  afterCents: signedCents,
  needsApproval: z.boolean(),
  short: z.boolean(),
  shortByCents: cents,
  approvalThresholdCents: cents,
  approverNames: z.array(z.string()),
});
export type EstimateView = z.infer<typeof estimateView>;

export const giftLinkView = z.object({ giftId: z.string(), recipientName: z.string(), url: z.string() });
export type GiftLinkView = z.infer<typeof giftLinkView>;

export const submitResultView = z.object({
  campaignId: z.string(),
  outcome: z.enum(["sent", "scheduled", "pending_approval"]),
  gifts: z.number().int().nonnegative(),
  totalCents: cents,
  // Gift links appear here once, when the campaign uses links or QR codes. Only their hashes are stored.
  links: z.array(giftLinkView),
});
export type SubmitResultView = z.infer<typeof submitResultView>;

export const funnelView = z.object({
  total: z.number().int(),
  sent: z.number().int(),
  opened: z.number().int(),
  chose: z.number().int(),
  shipped: z.number().int(),
  delivered: z.number().int(),
  expired: z.number().int(),
});

export const campaignSummaryView = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(CAMPAIGN_TYPES),
  status: z.enum(CAMPAIGN_STATUSES),
  displayStatus: z.enum(CAMPAIGN_DISPLAY_STATUSES),
  gift: z.object({
    kind: z.enum(["collection", "single", "bundle"]),
    label: z.string(),
    collectionId: z.string().nullable(),
    sku: z.string().nullable(),
    // A bundle's items; empty for the other kinds.
    skus: z.array(z.string()),
  }),
  budgetCents: cents,
  channels: z.array(z.enum(CHANNEL_KINDS)),
  sendAt: z.string().nullable(),
  createdAt: z.string(),
  funnel: funnelView,
  spentCents: cents,
});
export type CampaignSummaryView = z.infer<typeof campaignSummaryView>;

export const campaignListQuery = z.object({
  status: z.enum(["all", "active", "scheduled", "pending_approval"]).default("all"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const campaignListView = z.object({
  campaigns: z.array(campaignSummaryView),
  funnel: funnelView,
  counts: z.object({ all: z.number(), active: z.number(), scheduled: z.number(), pending_approval: z.number() }),
});
export type CampaignListView = z.infer<typeof campaignListView>;

export const campaignDetailView = campaignSummaryView.extend({
  greeting,
  message: z.string(),
  expiresInDays: z.number().int(),
  reminders: z.boolean(),
  createdByName: z.string(),
  approval: z
    .object({
      required: z.boolean(),
      approverNames: z.array(z.string()),
      decision: z.enum(["approved", "rejected"]).nullable(),
      decidedAt: z.string().nullable(),
    })
    .nullable(),
  // Whether the viewer may approve or decline it now.
  canDecide: z.boolean(),
  totalHoldCents: cents,
});
export type CampaignDetailView = z.infer<typeof campaignDetailView>;

export const giftRowView = z.object({
  id: z.string(),
  recipientName: z.string(),
  recipientEmail: z.string().nullable(),
  status: z.enum(GIFT_STATUSES),
  channel: z.enum(CHANNEL_KINDS),
  chosenSku: z.string().nullable(),
  // Every item ordered: the chosen one, or a bundle's. Empty until the recipient claims.
  orderedSkus: z.array(z.string()),
});
export type GiftRowView = z.infer<typeof giftRowView>;

export const decisionResultView = z.object({
  campaignId: z.string(),
  status: z.enum(CAMPAIGN_STATUSES),
});
export type DecisionResultView = z.infer<typeof decisionResultView>;
