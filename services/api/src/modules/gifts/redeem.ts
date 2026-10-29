import { getCollections } from "@gifting/db";
import {
  type Address,
  assertTransition,
  type Campaign,
  CLAIMABLE_STATUSES,
  type Gift,
  ledgerKeys,
  OrderError,
  orderNumberForGift,
  type ProductView,
} from "@gifting/domain";
import type { ClientSession } from "mongodb";

import type { AppDeps } from "../../deps";
import type { CatalogService } from "../catalog/service";
import type { LedgerService } from "../ledger/service";
import type { RecipientsService } from "../recipients/service";
import { sha256 } from "./service";

/** A claim older than this, with no order, is treated as stuck and may be picked up again. */
export const STALE_CLAIM_MS = 30_000;

/** An item as the recipient sees it: no price, ever. */
export type OfferedItem = Pick<ProductView, "sku" | "name" | "brand" | "description" | "category" | "vendorName" | "slaDays">;

/** What a recipient sees when they open their link. */
export type RedeemView =
  | { state: "invalid" | "used" | "expired" }
  | { state: "open"; from: string; headline: string; message: string; expiresOn: string; cover: string; occasion: string; brandColor: string | null };

export type RedeemResult =
  | { ok: true; orderNumber: string; sku: string }
  | { ok: false; reason: "invalid" | "used" | "expired" | "item-unavailable" | "try-again" };

type Lookup = { problem: "invalid" | "used" | "expired" } | { problem?: undefined; gift: Gift; campaign: Campaign };

export type RedeemService = ReturnType<typeof createRedeemService>;

const day = (d: Date) => d.toISOString().slice(0, 10);
const offered = (p: ProductView): OfferedItem => ({ sku: p.sku, name: p.name, brand: p.brand, description: p.description, category: p.category, vendorName: p.vendorName, slaDays: p.slaDays });

/**
 * Redemption (M4, docs/architecture/flows.md). The link's secret is the
 * credential: it is hashed and looked up, and nothing in it says who or what.
 * Choosing is one atomic claim (sent|opened → redeeming), then the order, then
 * one transaction that marks the gift redeemed and moves the ledger (release the
 * hold, capture what the order really cost).
 */
export function createRedeemService(deps: AppDeps, services: { catalog: CatalogService; ledger: LedgerService; recipients: RecipientsService }) {
  const c = () => getCollections(deps.db);

  async function lookup(token: string): Promise<Lookup> {
    const gift = await c().gifts.findOne({ tokenHash: sha256(token) });
    if (!gift) return { problem: "invalid" };
    const campaign = await c().campaigns.findOne({ _id: gift.campaignId });
    if (!campaign || (campaign.status !== "active" && campaign.status !== "sending")) return { problem: "invalid" };
    if (gift.status === "redeemed" || gift.status === "shipped" || gift.status === "delivered") return { problem: "used" };
    if (gift.status === "expired" || gift.status === "cancelled" || gift.expiresAt <= deps.now()) return { problem: "expired" };
    if (!(CLAIMABLE_STATUSES as readonly string[]).includes(gift.status) && gift.status !== "redeeming") return { problem: "invalid" };
    return { gift, campaign };
  }

  /** What this gift may choose from: the collection's items that fit the budget and are in stock, or the one gift. */
  async function eligible(campaign: Campaign, gift: Gift): Promise<ProductView[]> {
    if (campaign.collectionId) return (await services.catalog.collectionItems(campaign.companyKey, campaign.collectionId, gift.budgetCents)).filter((p) => p.available);
    const single = campaign.sku ? await deps.catalog.product(campaign.sku) : null;
    return single?.available ? [single] : [];
  }

  async function release(giftId: string, failureCode: string): Promise<void> {
    // Back to opened, so the recipient can choose again. The claim is cleared.
    await c().gifts.updateOne({ _id: giftId, status: "redeeming" }, { $set: { status: "opened", claim: null, updatedAt: deps.now() }, $inc: { version: 1 } });
    deps.log?.info({ giftId, failureCode }, "claim released");
  }

  async function complete(gift: Gift, campaign: Campaign, order: { orderNumber: string; totalCents: number }): Promise<void> {
    const tx: ClientSession = deps.client.startSession();
    try {
      await tx.withTransaction(async () => {
        const moved = await c().gifts.findOneAndUpdate(
          { _id: gift._id, status: "redeeming" },
          { $set: { status: "redeemed", "statusAt.redeemed": deps.now(), ctOrderNumber: order.orderNumber, "claim.status": "ordered", updatedAt: deps.now() }, $inc: { version: 1 } },
          { session: tx, returnDocument: "after" },
        );
        if (!moved) return; // already finished by another request: nothing more to write
        await services.ledger.capture({
          teamKey: gift.teamKey,
          giftId: gift._id,
          campaignId: campaign._id,
          holdNo: gift.holdNo,
          holdCents: gift.holdCents,
          captureCents: order.totalCents,
          feeCents: 0,
          createdBy: "recipient",
          session: tx,
        });
      });
    } finally {
      await tx.endSession();
    }
  }

  return {
    /** Opens the link: what the sender wrote. The first look marks the gift opened. */
    async view(token: string): Promise<RedeemView> {
      const found = await lookup(token);
      if (found.problem) return { state: found.problem };
      const { gift, campaign } = found;
      if (gift.status === "sent") {
        assertTransition("sent", "opened");
        await c().gifts.updateOne({ _id: gift._id, status: "sent" }, { $set: { status: "opened", "statusAt.opened": deps.now(), updatedAt: deps.now() }, $inc: { version: 1 } });
      }
      return {
        state: "open",
        from: campaign.greeting.fromName,
        headline: campaign.greeting.headline,
        message: campaign.message,
        expiresOn: day(gift.expiresAt),
        cover: campaign.greeting.cover,
        occasion: campaign.greeting.occasion,
        brandColor: campaign.branding.brandColor,
      };
    },

    /** The gifts to choose from, without prices. */
    async items(token: string): Promise<{ state: "invalid" | "used" | "expired" } | { state: "open"; items: OfferedItem[] }> {
      const found = await lookup(token);
      if (found.problem) return { state: found.problem };
      return { state: "open", items: (await eligible(found.campaign, found.gift)).map(offered) };
    },

    /** One offered gift, for its own page. Null if it is not one this gift may choose. */
    async item(token: string, sku: string): Promise<{ state: "invalid" | "used" | "expired" | "unavailable" } | { state: "open"; item: OfferedItem }> {
      const found = await lookup(token);
      if (found.problem) return { state: found.problem };
      const product = (await eligible(found.campaign, found.gift)).find((p) => p.sku === sku);
      return product ? { state: "open", item: offered(product) } : { state: "unavailable" };
    },

    /**
     * Chooses a gift exactly once and creates its order. One atomic claim stops
     * a second tap or a replay. The order number is GFT-<giftId>, so a retry
     * after a timeout looks the order up before creating another. The order
     * costs what it costs (item, shipping, tax); any amount above the gift's hold is
     * settled on the ledger, never refused.
     */
    async redeem(input: { token: string; sku: string; address: Address }): Promise<RedeemResult> {
      const found = await lookup(input.token);
      if (found.problem) return { ok: false, reason: found.problem };
      let { gift } = found;
      const { campaign } = found;

      const product = (await eligible(campaign, gift)).find((p) => p.sku === input.sku);
      if (!product) return { ok: false, reason: "item-unavailable" };

      const orderNumber = orderNumberForGift(gift._id);
      if (gift.status === "redeeming") {
        // Another request holds the claim. Only pick it up if it has been stuck, for the same item.
        const stuck = gift.claim && deps.now().getTime() - gift.claim.startedAt.getTime() > STALE_CLAIM_MS;
        if (!stuck || gift.claim?.sku !== product.sku) return { ok: false, reason: "try-again" };
      } else {
        const claimed = await c().gifts.findOneAndUpdate(
          { _id: gift._id, status: { $in: [...CLAIMABLE_STATUSES] }, expiresAt: { $gt: deps.now() } },
          {
            $set: { status: "redeeming", "statusAt.redeeming": deps.now(), claim: { sku: product.sku, idempotencyKey: orderNumber, status: "pending", startedAt: deps.now(), failureCode: null }, updatedAt: deps.now() },
            $inc: { version: 1 },
          },
          { returnDocument: "after" },
        );
        if (!claimed) return { ok: false, reason: "used" };
        gift = claimed;
      }

      const people = await services.recipients.byIds(gift.companyKey, [gift.recipientId]);
      const person = people.get(gift.recipientId);
      let order = await deps.orders?.find(orderNumber);
      if (!order) {
        try {
          if (!deps.orders) throw new OrderError("not_supported", "Order creation is not set up.");
          order = await deps.orders.place({
            orderNumber,
            giftId: gift._id,
            campaignId: campaign._id,
            companyKey: gift.companyKey,
            teamKey: gift.teamKey,
            vendorKey: product.vendorKey,
            sku: product.sku,
            captureKey: ledgerKeys.capture(gift._id, gift.holdNo),
            recipient: { name: person?.name ?? "Recipient", email: person?.email ?? "" },
            shipTo: input.address,
          });
        } catch (err) {
          if (!(err instanceof OrderError)) throw err;
          if (err.code === "unavailable") {
            // The platform may have created the order before failing. Look before giving up.
            order = await deps.orders?.find(orderNumber);
            if (!order) return { ok: false, reason: "try-again" };
          } else if (err.code === "not_supported") {
            // A setup problem, not the recipient's: free the claim and surface it as a server error.
            await release(gift._id, err.code);
            throw err;
          } else {
            // Out of stock: the recipient chooses again.
            await release(gift._id, err.code);
            return { ok: false, reason: "item-unavailable" };
          }
        }
      }

      await complete(gift, campaign, order);
      return { ok: true, orderNumber: order.orderNumber, sku: product.sku };
    },

    /** The order for a chosen gift, for the tracking page. */
    async order(token: string): Promise<{ state: "invalid" | "pending" } | { state: "ordered"; orderNumber: string; status: "ordered" | "shipped" | "delivered" }> {
      const gift = await c().gifts.findOne({ tokenHash: sha256(token) });
      if (!gift) return { state: "invalid" };
      if (!gift.ctOrderNumber) return { state: "pending" };
      return { state: "ordered", orderNumber: gift.ctOrderNumber, status: gift.status === "delivered" ? "delivered" : gift.status === "shipped" ? "shipped" : "ordered" };
    },
  };
}
