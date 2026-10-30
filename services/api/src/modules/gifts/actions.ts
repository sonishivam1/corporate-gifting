import { getCollections } from "@gifting/db";
import { assertTransition, type GiftStatus, HOLDING_STATUSES } from "@gifting/domain";

import type { AppDeps } from "../../deps";
import { ApiError } from "../../http/errors";
import type { Session } from "../../http/session";
import type { LedgerService } from "../ledger/service";

const CANCELLABLE: readonly GiftStatus[] = ["pending_approval", "scheduled", "sent", "opened"];

export type GiftActions = ReturnType<typeof createGiftActions>;

/** What a sender can do with a gift nobody has chosen yet. */
export function createGiftActions(deps: AppDeps, services: { ledger: LedgerService }) {
  const c = () => getCollections(deps.db);

  return {
    /**
     * Cancels a gift: its link stops working and its hold goes back to the
     * team's budget, in one transaction. The expected status is in the filter,
     * so a gift that was chosen in the meantime is left alone.
     */
    async cancel(session: Session, giftId: string): Promise<void> {
      const gift = await c().gifts.findOne({ _id: giftId, companyKey: session.companyKey, teamKey: session.teamKey });
      if (!gift) throw new ApiError(404, "gift_not_found", "Gift not found.");
      if (!CANCELLABLE.includes(gift.status)) throw new ApiError(409, "not_cancellable", "This gift has already been chosen.");
      assertTransition(gift.status, "cancelled");

      const tx = deps.client.startSession();
      try {
        const done = await tx.withTransaction(async () => {
          const moved = await c().gifts.findOneAndUpdate(
            { _id: gift._id, status: gift.status },
            { $set: { status: "cancelled", "statusAt.cancelled": deps.now(), updatedAt: deps.now() }, $inc: { version: 1 } },
            { session: tx, returnDocument: "after" },
          );
          if (!moved) return false;
          if ((HOLDING_STATUSES as readonly string[]).includes(gift.status) && gift.holdNo >= 1) {
            await services.ledger.release({ teamKey: gift.teamKey, giftId: gift._id, campaignId: gift.campaignId, holdNo: gift.holdNo, holdCents: gift.holdCents, createdBy: session.userId, session: tx });
          }
          return true;
        });
        if (!done) throw new ApiError(409, "not_cancellable", "This gift has already been chosen.");
      } finally {
        await tx.endSession();
      }
    },
  };
}
