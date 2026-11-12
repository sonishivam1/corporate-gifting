import type { AppDeps } from "../deps";
import type { RouteAuth, RouteDefinition, RouteSchema } from "../http/route";
import { createMembersService } from "./accounts/members";
import { membersRoutes } from "./accounts/members-routes";
import { accountsRoutes } from "./accounts/routes";
import { workspaceRoutes } from "./accounts/workspace";
import { campaignsRoutes } from "./campaigns/routes";
import { createCampaignsService } from "./campaigns/service";
import { createChannelsService } from "./channels/service";
import { catalogRoutes } from "./catalog/routes";
import { createCatalogService } from "./catalog/service";
import { createGiftActions } from "./gifts/actions";
import { createRedeemService } from "./gifts/redeem";
import { recipientRoutes } from "./gifts/recipient-routes";
import { giftsRoutes } from "./gifts/routes";
import { senderGiftRoutes } from "./gifts/sender-routes";
import { createGiftsService } from "./gifts/service";
import { ledgerRoutes } from "./ledger/routes";
import { createLedgerService } from "./ledger/service";
import { recipientsRoutes } from "./recipients/routes";
import { createRecipientsService } from "./recipients/service";
import { reportingRoutes } from "./reporting/routes";
import { createReportingService } from "./reporting/service";

/**
 * The ten modules (docs/architecture/overview.md). Each has its own folder
 * with routes.ts and service.ts as it is built; a module calls another only
 * through that module's service, never its collections.
 */
export type ApiModule = {
  name: string;
  milestone: string;
  routes: readonly RouteDefinition<RouteSchema, RouteAuth>[];
};

export function buildModules(deps: AppDeps): ApiModule[] {
  const ledger = createLedgerService(deps);
  const catalog = createCatalogService(deps);
  const recipients = createRecipientsService(deps);
  const gifts = createGiftsService(deps, { recipients });
  const channels = createChannelsService(deps, { recipients });
  const redeem = createRedeemService(deps, { catalog, ledger, recipients });
  const giftActions = createGiftActions(deps, { ledger });
  const campaigns = createCampaignsService(deps, { catalog, ledger, recipients, gifts, channels });
  const reporting = createReportingService(deps, { gifts, ledger, campaigns });
  const members = createMembersService(deps);

  return [
    { name: "accounts", milestone: "M1", routes: [...accountsRoutes, ...workspaceRoutes(deps, members), ...membersRoutes(members, deps)] },
    { name: "ledger", milestone: "M1", routes: ledgerRoutes(ledger) },
    { name: "catalog", milestone: "M2", routes: catalogRoutes(catalog) },
    { name: "campaigns", milestone: "M3", routes: campaignsRoutes(campaigns) },
    { name: "recipients", milestone: "M5", routes: recipientsRoutes(recipients) },
    { name: "gifts", milestone: "M3", routes: [...giftsRoutes(gifts, campaigns), ...senderGiftRoutes(channels, giftActions), ...recipientRoutes(redeem)] },
    { name: "fulfillment", milestone: "M4", routes: [] },
    { name: "channels", milestone: "M3", routes: [] },
    { name: "integrations", milestone: "M1", routes: [] },
    { name: "reporting", milestone: "M6", routes: reportingRoutes(reporting) },
  ];
}
