import { getCollections } from "@gifting/db";
import { type Campaign, deliveryChannel, type Gift, type RecipientView } from "@gifting/domain";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";
import type { Session } from "../../http/session";
import { newGiftSecret } from "../gifts/service";
import type { RecipientsService } from "../recipients/service";

export type DeliverySummary = { sent: number; failed: number; skipped: number };
export type ChannelsService = ReturnType<typeof createChannelsService>;

const BATCH = 5;
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Delivers gifts through their campaign's channel (ADR 0008). A gift's send
 * notification starts `queued`. One deliverer claims it (`sending`) with an
 * atomic update, sends, and records `sent` or `failed`, so two deliverers or a
 * retry can never send the same message twice.
 *
 * A gift link is a secret that is stored only as a hash, so it cannot be read
 * back to send later. Delivery therefore works two ways:
 *   - right after a campaign is sent, with the links just minted in memory;
 *   - later (scheduled campaigns, approvals, retries, "send again"), by minting
 *     a fresh link: the new link replaces the old one, which stops working.
 */
export function createChannelsService(deps: AppDeps, services: { recipients: RecipientsService }) {
  const c = () => getCollections(deps.db);

  async function setNotification(giftId: string, to: "sent" | "failed", providerMessageId: string | null) {
    await c().gifts.updateOne(
      { _id: giftId },
      { $set: { "notifications.$[n].status": to, "notifications.$[n].providerMessageId": providerMessageId, "notifications.$[n].at": deps.now(), updatedAt: deps.now() } },
      { arrayFilters: [{ "n.kind": "send", "n.status": "sending" }] },
    );
  }

  /** Claims the queued notification and sends one message. */
  async function deliver(campaign: Campaign, gift: Gift, url: string, person: RecipientView | undefined): Promise<keyof DeliverySummary> {
    const kind = deliveryChannel(campaign.channels);
    const channel = deps.channels?.has(kind) ? deps.channels.get(kind) : null;
    if (!channel) return "skipped"; // stays queued until a channel for it is registered

    const claimed = await c().gifts.updateOne(
      { _id: gift._id, status: { $in: ["sent", "opened"] }, notifications: { $elemMatch: { kind: "send", status: "queued" } } },
      { $set: { "notifications.$[n].status": "sending", updatedAt: deps.now() } },
      { arrayFilters: [{ "n.kind": "send", "n.status": "queued" }] },
    );
    if (claimed.modifiedCount !== 1) return "skipped"; // someone else has it, or it is no longer deliverable

    const to = person?.email;
    if (!to) {
      await setNotification(gift._id, "failed", null);
      return "failed";
    }
    try {
      const result = await channel.send({
        giftId: gift._id,
        companyKey: gift.companyKey,
        to,
        link: url,
        greeting: campaign.greeting.headline,
        senderName: campaign.greeting.fromName,
        recipientName: person.name,
        message: campaign.message,
        expiresOn: day(gift.expiresAt),
        branding: campaign.branding,
      });
      await setNotification(gift._id, "sent", result.providerMessageId);
      return "sent";
    } catch (err) {
      deps.log?.warn({ giftId: gift._id, campaignId: campaign._id, err }, "gift delivery failed");
      await setNotification(gift._id, "failed", null);
      return "failed";
    }
  }

  async function run(campaign: Campaign, items: ReadonlyArray<{ gift: Gift; url: string }>): Promise<DeliverySummary> {
    const summary: DeliverySummary = { sent: 0, failed: 0, skipped: 0 };
    const people = await services.recipients.byIds(campaign.companyKey, items.map((i) => i.gift.recipientId));
    for (let i = 0; i < items.length; i += BATCH) {
      const results = await Promise.all(items.slice(i, i + BATCH).map(({ gift, url }) => deliver(campaign, gift, url, people.get(gift.recipientId))));
      for (const r of results) summary[r] += 1;
    }
    return summary;
  }

  /** Puts a fresh link on a gift that is waiting to be delivered. Null if it is no longer waiting. */
  async function reissue(gift: Gift, now: Date): Promise<{ gift: Gift; url: string } | null> {
    const secret = newGiftSecret();
    const updated = await c().gifts.findOneAndUpdate(
      { _id: gift._id, status: { $in: ["sent", "opened"] }, claim: null, notifications: { $elemMatch: { kind: "send", status: "queued" } } },
      { $set: { tokenHash: secret.tokenHash, codeHash: secret.codeHash, updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: "after" },
    );
    return updated ? { gift: updated, url: `${deps.recipientBaseUrl}/r/${secret.token}` } : null;
  }

  return {
    /** Delivers a campaign's gifts with the links just minted. Best effort: a gift that fails stays retryable. */
    async deliverFresh(campaign: Campaign, items: ReadonlyArray<{ gift: Gift; url: string }>): Promise<DeliverySummary> {
      return run(campaign, items);
    },

    /**
     * The sender sends one gift again with a brand-new link. The old link stops
     * working the moment the new one is made, so a link that leaked or was
     * forwarded can be replaced. Only a gift nobody has chosen yet.
     */
    async resend(session: Session, giftId: string): Promise<"sent" | "failed"> {
      const gift = await c().gifts.findOne({ _id: giftId, companyKey: session.companyKey, teamKey: session.teamKey });
      const campaign = gift ? await c().campaigns.findOne({ _id: gift.campaignId, teamKey: session.teamKey }) : null;
      if (!gift || !campaign) throw new ApiError(404, "gift_not_found", "Gift not found.");
      if ((gift.status !== "sent" && gift.status !== "opened") || gift.claim) throw new ApiError(409, "not_resendable", "This gift can't be sent again.");
      if (campaign.status !== "active" && campaign.status !== "sending") throw new ApiError(409, "not_resendable", "This gift can't be sent again.");

      const now = deps.now();
      // A new queued message, so delivery has something to claim; then a fresh link that replaces the old one.
      await c().gifts.updateOne(
        { _id: gift._id, status: { $in: ["sent", "opened"] }, claim: null },
        { $push: { notifications: { channel: deliveryChannel(campaign.channels), kind: "send", reminderNo: 0, providerMessageId: null, status: "queued", at: now } }, $set: { updatedAt: now } },
      );
      const fresh = await reissue(gift, now);
      if (!fresh) throw new ApiError(409, "not_resendable", "This gift can't be sent again.");
      const summary = await run(campaign, [fresh]);
      return summary.sent === 1 ? "sent" : "failed";
    },
  };
}
