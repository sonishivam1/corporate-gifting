import type { AppDeps } from "../deps";
import type { RouteDefinition } from "../http/route";
import { accountsRoutes } from "./accounts/routes";
import { campaignsRoutes } from "./campaigns/routes";
import { createCampaignsService } from "./campaigns/service";
import { catalogRoutes } from "./catalog/routes";
import { createCatalogService } from "./catalog/service";
import { giftsRoutes } from "./gifts/routes";
import { createGiftsService } from "./gifts/service";
import { ledgerRoutes } from "./ledger/routes";
import { createLedgerService } from "./ledger/service";
import { recipientsRoutes } from "./recipients/routes";
import { createRecipientsService } from "./recipients/service";

/**
 * The ten modules (docs/architecture/overview.md). Each has its own folder
 * with routes.ts and service.ts as it is built; a module calls another only
 * through that module's service, never its collections.
 */
export type ApiModule = {
  name: string;
  milestone: string;
  routes: readonly RouteDefinition[];
};

export function buildModules(deps: AppDeps): ApiModule[] {
  const ledger = createLedgerService(deps);
  const catalog = createCatalogService(deps);
  const recipients = createRecipientsService(deps);
  const gifts = createGiftsService(deps, { recipients });
  const campaigns = createCampaignsService(deps, { catalog, ledger, recipients, gifts });

  return [
    { name: "accounts", milestone: "M1", routes: accountsRoutes(deps) },
    { name: "ledger", milestone: "M1", routes: ledgerRoutes(ledger) },
    { name: "catalog", milestone: "M2", routes: catalogRoutes(catalog) },
    { name: "campaigns", milestone: "M3", routes: campaignsRoutes(campaigns) },
    { name: "recipients", milestone: "M5", routes: recipientsRoutes(recipients) },
    { name: "gifts", milestone: "M3", routes: giftsRoutes(gifts, campaigns) },
    { name: "fulfillment", milestone: "M4", routes: [] },
    { name: "channels", milestone: "M3", routes: [] },
    { name: "integrations", milestone: "M1", routes: [] },
    { name: "reporting", milestone: "M6", routes: [] },
  ];
}
