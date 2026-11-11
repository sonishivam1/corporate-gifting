import { createHash, randomBytes, randomUUID } from "node:crypto";

import { getCollections } from "@gifting/db";
import {
  assertTransition,
  type Campaign,
  type Cents,
  type ChannelKind,
  deliveryChannel,
  type Gift,
  type GiftLinkView,
  type GiftRowView,
  type GiftStatus,
  type OverviewGift,
  type RecipientView,
} from "@gifting/domain";
import type { ClientSession } from "mongodb";

import type { AppDeps } from "../../deps";
import type { RecipientsService } from "../recipients/service";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// Short codes avoid look-alike characters (no I, L, O, U, 0, 1).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const shortCode = () => [...randomBytes(8)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");

/** A gift link carries 32 random bytes; only its SHA-256 hash is stored. */
export function newGiftSecret() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token), codeHash: sha256(shortCode()) };
}

export type GiftsService = ReturnType<typeof createGiftsService>;

export function createGiftsService(deps: AppDeps, services: { recipients: RecipientsService }) {
  const c = () => getCollections(deps.db);

  const sendNotification = (channel: ChannelKind, at: Date) => ({
    channel,
    kind: "send" as const,
    reminderNo: 0,
    providerMessageId: null,
    // Channel adapters pick these up from M3.4; nothing is delivered yet.
    status: "queued" as const,
    at,
  });

  return {
    /**
     * One gift per recipient, written in the caller's transaction. The unique
     * {campaignId, recipientId, occurrence} index refuses a second set. Links
     * are returned once and never stored.
     */
    async createForCampaign(input: {
      campaign: Campaign;
      recipients: readonly RecipientView[];
      status: Extract<GiftStatus, "pending_approval" | "scheduled" | "sent">;
      holdCents: Cents;
      session: ClientSession;
    }): Promise<{ gifts: Gift[]; links: GiftLinkView[] }> {
      assertTransition("created", input.status);
      const now = deps.now();
      const start = input.campaign.sendAt ?? now;
      const expiresAt = new Date(start.getTime() + input.campaign.expiresInDays * 86_400_000);
      const channel = deliveryChannel(input.campaign.channels);
      const links: GiftLinkView[] = [];

      const gifts: Gift[] = input.recipients.map((r) => {
        const secret = newGiftSecret();
        const _id = randomUUID();
        links.push({ giftId: _id, recipientName: r.name, url: `${deps.recipientBaseUrl}/r/${secret.token}` });
        return {
          _id,
          companyKey: input.campaign.companyKey,
          teamKey: input.campaign.teamKey,
          campaignId: input.campaign._id,
          recipientId: r.id,
          occurrence: "once",
          budgetCents: input.campaign.budgetCents,
          holdCents: input.holdCents,
          // 1 once a hold is placed; gifts waiting for approval have none yet.
          holdNo: input.status === "pending_approval" ? 0 : 1,
          tokenHash: secret.tokenHash,
          codeHash: secret.codeHash,
          status: input.status,
          statusAt: { [input.status]: now },
          version: 0,
          expiresAt,
          claim: null,
          notifications: input.status === "sent" ? [sendNotification(channel, now)] : [],
          ctOrderNumber: null,
          createdAt: now,
          updatedAt: now,
        };
      });
      if (gifts.length > 0) await c().gifts.insertMany(gifts, { session: input.session });
      return { gifts, links };
    },

    /**
     * Moves every gift of a campaign from one status to another (approval,
     * decline). The expected status is in the filter, so a stale or repeated
     * call changes nothing.
     */
    async moveCampaignGifts(input: {
      teamKey: string;
      campaign: Campaign;
      from: GiftStatus;
      to: GiftStatus;
      session: ClientSession;
    }): Promise<Gift[]> {
      assertTransition(input.from, input.to);
      const now = deps.now();
      const filter = { teamKey: input.teamKey, campaignId: input.campaign._id, status: input.from };
      const gifts = await c().gifts.find(filter, { session: input.session }).toArray();
      if (gifts.length === 0) return [];
      const placesHold = input.to === "sent" || input.to === "scheduled";
      await c().gifts.updateMany(
        { ...filter, _id: { $in: gifts.map((g) => g._id) } },
        {
          $set: { status: input.to, [`statusAt.${input.to}`]: now, updatedAt: now, ...(placesHold ? { holdNo: 1 } : {}) },
          $inc: { version: 1 },
          ...(input.to === "sent" ? { $push: { notifications: sendNotification(deliveryChannel(input.campaign.channels), now) } } : {}),
        },
        { session: input.session },
      );
      return gifts;
    },

    /** The team's gifts that went out from `since` on, or are still open: what the Home overview counts. */
    async forOverview(teamKey: string, since: Date): Promise<OverviewGift[]> {
      return c()
        .gifts.find(
          { teamKey, $or: [{ "statusAt.sent": { $gte: since } }, { createdAt: { $gte: since } }, { status: { $in: ["sent", "opened"] } }] },
          { projection: { _id: 0, status: 1, statusAt: 1, expiresAt: 1, createdAt: 1 } },
        )
        .toArray();
    },

    /** Gift statuses per campaign, for funnels. */
    async statusesByCampaign(teamKey: string): Promise<Map<string, GiftStatus[]>> {
      const rows = await c()
        .gifts.aggregate<{ _id: { campaignId: string; status: GiftStatus }; n: number }>([
          { $match: { teamKey } },
          { $group: { _id: { campaignId: "$campaignId", status: "$status" }, n: { $sum: 1 } } },
        ])
        .toArray();
      const out = new Map<string, GiftStatus[]>();
      for (const row of rows) {
        const list = out.get(row._id.campaignId) ?? [];
        for (let i = 0; i < row.n; i++) list.push(row._id.status);
        out.set(row._id.campaignId, list);
      }
      return out;
    },

    async rowsForCampaign(companyKey: string, teamKey: string, campaign: Campaign): Promise<GiftRowView[]> {
      const gifts = await c().gifts.find({ teamKey, campaignId: campaign._id }).sort({ createdAt: 1 }).toArray();
      const people = await services.recipients.byIds(companyKey, gifts.map((g) => g.recipientId));
      const fallback = deliveryChannel(campaign.channels);
      return gifts
        .map((g) => ({
          id: g._id,
          recipientName: people.get(g.recipientId)?.name ?? "Removed recipient",
          recipientEmail: people.get(g.recipientId)?.email ?? null,
          status: g.status,
          channel: g.notifications[0]?.channel ?? fallback,
          chosenSku: g.claim?.sku ?? null,
          orderedSkus: g.claim ? (g.claim.skus ?? [g.claim.sku]) : [],
        }))
        .sort((a, b) => a.recipientName.localeCompare(b.recipientName));
    },
  };
}
