/**
 * Loads the commerce connector this deployment names in COMMERCE_CONNECTOR
 * (plan: commerce-connectors.md). Connectors are packages,
 * `@gifting/commerce-<name>`; every one in package.json is listed in the
 * generated `installed.ts`. This is the only API code that knows any
 * connector exists.
 */
import { type CommerceConnector, connectorProblem } from "@gifting/commerce";
import type { Logger } from "@gifting/logger";

import { INSTALLED_CONNECTORS } from "./installed";

/** The connector named in COMMERCE_CONNECTOR, checked and ready; null when none is named. */
export async function loadConnector(context: { env: Record<string, string | undefined>; log: Logger; production: boolean }): Promise<CommerceConnector | null> {
  const name = context.env.COMMERCE_CONNECTOR?.trim();
  if (!name) return null;
  const load = INSTALLED_CONNECTORS[name];
  if (!load) {
    const installed = Object.keys(INSTALLED_CONNECTORS).join(", ") || "none";
    throw new Error(`COMMERCE_CONNECTOR=${name} is not installed. Installed connectors: ${installed}. Add @gifting/commerce-${name} to services/api/package.json.`);
  }
  const connector = await (await load()).default(context);
  const problem = connectorProblem(connector);
  if (problem) throw new Error(problem);
  await connector.check?.();
  return connector;
}
