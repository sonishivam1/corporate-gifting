import type { RouteDefinition } from "../http/route";

/**
 * The ten modules (docs/architecture/overview.md). Each gets its own folder
 * with routes.ts, service.ts and repo.ts as it is built; a module calls
 * another only through that module's service.
 */
export type ApiModule = {
  name: string;
  milestone: string;
  routes: readonly RouteDefinition[];
};

export const MODULES: readonly ApiModule[] = [
  { name: "accounts", milestone: "M1", routes: [] },
  { name: "ledger", milestone: "M1", routes: [] },
  { name: "catalog", milestone: "M2", routes: [] },
  { name: "campaigns", milestone: "M3", routes: [] },
  { name: "recipients", milestone: "M5", routes: [] },
  { name: "gifts", milestone: "M3", routes: [] },
  { name: "fulfillment", milestone: "M4", routes: [] },
  { name: "channels", milestone: "M3", routes: [] },
  { name: "integrations", milestone: "M1", routes: [] },
  { name: "reporting", milestone: "M6", routes: [] },
];
