/**
 * The sender Home's overview (plan: sender-home-redesign.md): balance, gifts
 * sent and chosen, links expiring soon, daily activity and where gifts are.
 * It reads through the other modules' services and counts with the pure
 * `overviewFrom()` in `@gifting/domain`.
 */
import { overviewFrom, type OverviewRange, type OverviewView, overviewWindow } from "@gifting/domain";

import type { AppDeps } from "../../deps";
import type { Session } from "../../http/session";
import type { CampaignsService } from "../campaigns/service";
import type { GiftsService } from "../gifts/service";
import type { LedgerService } from "../ledger/service";

export type ReportingService = ReturnType<typeof createReportingService>;

export function createReportingService(deps: AppDeps, services: { gifts: GiftsService; ledger: LedgerService; campaigns: CampaignsService }) {
  return {
    async overview(session: Session, range: OverviewRange): Promise<OverviewView> {
      const now = deps.now();
      const since = new Date(overviewWindow(range, now).previousFrom);
      const [gifts, balance, pendingApprovals] = await Promise.all([
        services.gifts.forOverview(session.teamKey, since),
        services.ledger.balance(session.teamKey),
        services.campaigns.pendingApprovalCount(session),
      ]);
      return {
        ...overviewFrom(gifts, range, now),
        balance: { currency: balance.currency, availableCents: balance.availableCents, heldCents: balance.heldCents, spentCents: balance.spentCents },
        pendingApprovals,
      };
    },
  };
}
