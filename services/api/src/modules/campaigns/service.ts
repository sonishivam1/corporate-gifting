import { randomUUID } from "node:crypto";

import { getCollections } from "@gifting/db";
import {
  addFunnels,
  type Campaign,
  campaignDisplayStatus,
  type CampaignDetailView,
  campaignFunnel,
  type CampaignListView,
  type CampaignSummaryView,
  defaultCampaignName,
  type DecisionResultView,
  type EstimateView,
  estimateSend,
  hasShareableLinks,
  type SendRequest,
  type SubmitResultView,
} from "@gifting/domain";
import { holdAmount } from "@gifting/ledger";
import type { ClientSession } from "mongodb";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";
import type { Session } from "../../http/session";
import type { OrgTeam } from "../accounts/org";
import type { CatalogService, ResolvedGift } from "../catalog/service";
import type { GiftsService } from "../gifts/service";
import type { LedgerService } from "../ledger/service";
import type { RecipientsService } from "../recipients/service";

type ListStatus = "all" | "active" | "scheduled" | "pending_approval";

/**
 * Per-gift hold. Shipping, tax and the fee are open questions
 * (docs/business/open-questions.md); they are zero until decided and slot in
 * here without changing the flow.
 */
const holdFor = (budgetCents: number) =>
  holdAmount({ budgetCents, shippingAllowanceCents: 0, taxEstimateCents: 0, feeCents: 0 });

const LIST_FILTERS: Record<ListStatus, (c: Campaign) => boolean> = {
  all: () => true,
  active: (c) => c.status === "active" || c.status === "sending",
  scheduled: (c) => c.status === "approved",
  pending_approval: (c) => c.status === "pending_approval",
};

export type CampaignsService = ReturnType<typeof createCampaignsService>;

export function createCampaignsService(
  deps: AppDeps,
  services: { catalog: CatalogService; ledger: LedgerService; recipients: RecipientsService; gifts: GiftsService },
) {
  const c = () => getCollections(deps.db);

  async function team(session: Session): Promise<OrgTeam> {
    const found = await deps.org.team(session.companyKey, session.teamKey);
    if (!found) throw new ApiError(404, "team_not_found", "Team not found.");
    return found;
  }

  async function approverNames(t: OrgTeam): Promise<string[]> {
    const members = await Promise.all(t.approverIds.map((id) => deps.org.member(id)));
    return members.flatMap((m) => (m ? [m.name] : []));
  }

  /** Scoped to the caller's company and team: anything else is "not found". */
  async function find(session: Session, id: string, tx?: ClientSession): Promise<Campaign> {
    const found = await c().campaigns.findOne({ _id: id, companyKey: session.companyKey, teamKey: session.teamKey }, { session: tx });
    if (!found) throw new ApiError(404, "campaign_not_found", "Campaign not found.");
    return found;
  }

  function checkSendDate(sendAt: string | null): Date | null {
    if (!sendAt) return null;
    const today = deps.now().toISOString().slice(0, 10);
    if (sendAt <= today) throw new ApiError(422, "invalid_send_date", "Pick a send date after today.");
    return new Date(`${sendAt}T12:00:00Z`);
  }

  async function estimateFor(session: Session, gift: ResolvedGift, recipients: number, tx?: ClientSession): Promise<EstimateView> {
    const t = await team(session);
    const balance = await services.ledger.balance(session.teamKey, tx);
    return {
      ...estimateSend({
        gifts: recipients,
        holdCents: holdFor(gift.budgetCents),
        availableCents: balance.availableCents,
        approvalThresholdCents: t.approvalThresholdCents,
      }),
      approvalThresholdCents: t.approvalThresholdCents,
      approverNames: await approverNames(t),
    };
  }

  function giftOf(campaign: Campaign): ResolvedGift {
    return {
      kind: campaign.collectionId ? "collection" : "single",
      collectionId: campaign.collectionId,
      sku: campaign.sku,
      label: "",
      budgetCents: campaign.budgetCents,
    };
  }

  async function summaries(session: Session, campaigns: readonly Campaign[]): Promise<CampaignSummaryView[]> {
    const [statuses, spent, labels] = await Promise.all([
      services.gifts.statusesByCampaign(session.teamKey),
      services.ledger.spentByCampaign(session.teamKey),
      services.catalog.labels(session.companyKey),
    ]);
    return campaigns.map((cmp) => ({
      id: cmp._id,
      name: cmp.name,
      type: cmp.type,
      status: cmp.status,
      displayStatus: campaignDisplayStatus(cmp.status),
      gift: {
        kind: cmp.collectionId ? "collection" : "single",
        label: cmp.collectionId
          ? (labels.collections.get(cmp.collectionId) ?? "Collection")
          : (labels.products.get(cmp.sku ?? "") ?? cmp.sku ?? "Gift"),
        collectionId: cmp.collectionId,
        sku: cmp.sku,
      },
      budgetCents: cmp.budgetCents,
      channels: cmp.channels,
      sendAt: cmp.sendAt?.toISOString() ?? null,
      createdAt: cmp.createdAt.toISOString(),
      funnel: campaignFunnel(statuses.get(cmp._id) ?? []),
      spentCents: spent.get(cmp._id) ?? 0,
    }));
  }

  async function withTransaction<T>(fn: (tx: ClientSession) => Promise<T>): Promise<T> {
    const tx = deps.client.startSession();
    try {
      return await tx.withTransaction(() => fn(tx));
    } finally {
      await tx.endSession();
    }
  }

  return {
    /** What a send would cost, without saving anything. */
    async estimate(session: Session, input: SendRequest): Promise<EstimateView> {
      const gift = await services.catalog.resolveGift(session.companyKey, input.gift);
      const people = await services.recipients.resolve(session.companyKey, input, { create: false });
      return estimateFor(session, gift, people.length);
    },

    async estimateSaved(session: Session, id: string): Promise<EstimateView> {
      const campaign = await find(session, id);
      return estimateFor(session, giftOf(campaign), campaign.recipientIds.length);
    },

    /**
     * Saves a draft. The idempotency key becomes the campaign id, so a
     * retried request returns the same campaign instead of a second one.
     */
    async create(session: Session, input: SendRequest, idempotencyKey: string | null): Promise<{ id: string }> {
      if (idempotencyKey) {
        const existing = await c().campaigns.findOne({ _id: idempotencyKey });
        if (existing) {
          if (existing.companyKey !== session.companyKey || existing.teamKey !== session.teamKey) {
            throw new ApiError(409, "idempotency_key_reused", "That idempotency key was already used.");
          }
          return { id: existing._id };
        }
      }
      const sendAt = checkSendDate(input.sendAt);
      const gift = await services.catalog.resolveGift(session.companyKey, input.gift);
      const people = await services.recipients.resolve(session.companyKey, input, { create: true });
      if (people.length === 0) throw new ApiError(422, "no_recipients", "Add at least one recipient.");

      const now = deps.now();
      const campaign: Campaign = {
        _id: idempotencyKey ?? randomUUID(),
        companyKey: session.companyKey,
        teamKey: session.teamKey,
        name: input.name || defaultCampaignName(input.greeting.occasion, sendAt ?? now),
        type: sendAt ? "scheduled" : "one-time",
        status: "draft",
        collectionId: gift.collectionId,
        sku: gift.sku,
        budgetCents: gift.budgetCents,
        channels: input.channels,
        branding: { brandColor: null, logoUrl: null },
        greeting: input.greeting,
        message: input.message,
        recipientIds: people.map((p) => p.id),
        reminders: input.reminders,
        expiresInDays: input.expiresInDays,
        sendAt,
        approval: null,
        trigger: null,
        createdBy: session.userId,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await c().campaigns.insertOne(campaign);
      } catch (err) {
        // Two identical requests raced; the first one won.
        if ((err as { code?: unknown }).code === 11000 && idempotencyKey) return { id: idempotencyKey };
        throw err;
      }
      return { id: campaign._id };
    },

    /**
     * Sends a draft. Above the team's threshold it waits for an approver and
     * nothing is held. Otherwise, in one transaction: the campaign leaves
     * draft, one gift per recipient is created and one hold per gift placed.
     * Short of funds, nothing is written. A second submit changes nothing.
     */
    async submit(session: Session, id: string): Promise<SubmitResultView> {
      return withTransaction(async (tx) => {
        const campaign = await find(session, id, tx);
        if (campaign.status !== "draft") {
          const outcome = campaign.status === "pending_approval" ? "pending_approval" : campaign.status === "approved" ? "scheduled" : "sent";
          return { campaignId: campaign._id, outcome, gifts: campaign.recipientIds.length, totalCents: 0, links: [] };
        }

        const estimate = await estimateFor(session, giftOf(campaign), campaign.recipientIds.length, tx);
        if (estimate.short) {
          throw new ApiError(409, "insufficient_funds", "The team's budget can't cover these gifts. Top up or send to fewer people.");
        }
        const now = deps.now();
        const status = estimate.needsApproval ? "pending_approval" : campaign.sendAt ? "approved" : "active";
        const claimed = await c().campaigns.findOneAndUpdate(
          { _id: campaign._id, teamKey: session.teamKey, status: "draft" },
          {
            $set: {
              status,
              approval: { required: estimate.needsApproval, approverId: null, decidedAt: null, decision: null },
              updatedAt: now,
            },
          },
          { session: tx, returnDocument: "after" },
        );
        if (!claimed) throw new ApiError(409, "already_submitted", "This campaign was already sent.");

        const people = await services.recipients.byIds(session.companyKey, campaign.recipientIds);
        const giftStatus = estimate.needsApproval ? "pending_approval" : campaign.sendAt ? "scheduled" : "sent";
        const { gifts, links } = await services.gifts.createForCampaign({
          campaign: claimed,
          recipients: [...people.values()],
          status: giftStatus,
          holdCents: estimate.holdCents,
          session: tx,
        });
        if (!estimate.needsApproval) {
          await services.ledger.placeHolds({
            teamKey: session.teamKey,
            holds: gifts.map((g) => ({ giftId: g._id, campaignId: campaign._id, holdCents: g.holdCents })),
            createdBy: session.userId,
            session: tx,
          });
        }
        return {
          campaignId: campaign._id,
          outcome: giftStatus,
          gifts: gifts.length,
          totalCents: estimate.totalCents,
          links: hasShareableLinks(campaign.channels) ? links : [],
        };
      });
    },

    /**
     * An approver (never the campaign's sender) approves: holds are placed and
     * the gifts go out, or wait for their send date. Short of funds, nothing
     * changes.
     */
    async decide(session: Session, id: string, decision: "approved" | "rejected"): Promise<DecisionResultView> {
      const t = await team(session);
      return withTransaction(async (tx) => {
        const campaign = await find(session, id, tx);
        if (!t.approverIds.includes(session.userId)) throw new ApiError(404, "campaign_not_found", "Campaign not found.");
        if (campaign.createdBy === session.userId) {
          throw new ApiError(403, "self_approval", "Someone other than the sender must approve this campaign.");
        }
        if (campaign.status !== "pending_approval") {
          throw new ApiError(409, "not_pending_approval", "This campaign isn't waiting for approval.");
        }

        const now = deps.now();
        const status = decision === "rejected" ? "cancelled" : campaign.sendAt ? "approved" : "active";
        const claimed = await c().campaigns.findOneAndUpdate(
          { _id: campaign._id, teamKey: session.teamKey, status: "pending_approval" },
          {
            $set: {
              status,
              approval: { required: true, approverId: session.userId, decidedAt: now, decision },
              updatedAt: now,
            },
          },
          { session: tx, returnDocument: "after" },
        );
        if (!claimed) throw new ApiError(409, "not_pending_approval", "This campaign isn't waiting for approval.");

        const to = decision === "rejected" ? "cancelled" : campaign.sendAt ? "scheduled" : "sent";
        const gifts = await services.gifts.moveCampaignGifts({
          teamKey: session.teamKey,
          campaign: claimed,
          from: "pending_approval",
          to,
          session: tx,
        });
        if (decision === "approved") {
          await services.ledger.placeHolds({
            teamKey: session.teamKey,
            holds: gifts.map((g) => ({ giftId: g._id, campaignId: campaign._id, holdCents: g.holdCents })),
            createdBy: session.userId,
            session: tx,
          });
        }
        return { campaignId: campaign._id, status };
      });
    },

    async list(session: Session, query: { status: ListStatus; limit: number }): Promise<CampaignListView> {
      const all = await c()
        .campaigns.find({ companyKey: session.companyKey, teamKey: session.teamKey, status: { $ne: "draft" } })
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray();
      const views = await summaries(session, all);
      const shown = views.filter((_, i) => LIST_FILTERS[query.status](all[i]!)).slice(0, query.limit);
      const count = (s: ListStatus) => all.filter(LIST_FILTERS[s]).length;
      return {
        campaigns: shown,
        funnel: addFunnels(views.map((v) => v.funnel)),
        counts: { all: count("all"), active: count("active"), scheduled: count("scheduled"), pending_approval: count("pending_approval") },
      };
    },

    async detail(session: Session, id: string): Promise<CampaignDetailView> {
      const campaign = await find(session, id);
      const [summary] = await summaries(session, [campaign]);
      const t = await team(session);
      const creator = await deps.org.member(campaign.createdBy);
      return {
        ...summary!,
        greeting: campaign.greeting,
        message: campaign.message,
        expiresInDays: campaign.expiresInDays,
        reminders: campaign.reminders,
        createdByName: creator?.name ?? "Unknown",
        approval: campaign.approval
          ? {
              required: campaign.approval.required,
              approverNames: await approverNames(t),
              decision: campaign.approval.decision,
              decidedAt: campaign.approval.decidedAt?.toISOString() ?? null,
            }
          : null,
        canDecide:
          campaign.status === "pending_approval" &&
          t.approverIds.includes(session.userId) &&
          campaign.createdBy !== session.userId,
        totalHoldCents: campaign.recipientIds.length * holdFor(campaign.budgetCents),
      };
    },

    find,
  };
}

