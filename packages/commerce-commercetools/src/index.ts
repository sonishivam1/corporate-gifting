import { CONTRACT_VERSION, defineConnector } from "@gifting/commerce";
import { createCtApi, loadCtApiConfig, loadCtConfig } from "@gifting/ct";

import { createCtAccounts, loadSignInClientConfig } from "./accounts";
import { createCtCatalog } from "./catalog-connector";
import { createCtOrderPlacer, orderWritesAllowed } from "./orders";
import { createCtOrganizationWrites } from "./organization-writes";
import { createCtOrganizations } from "./organizations";

export { createCtAccounts, loadSignInClientConfig, signInScopeProblem } from "./accounts";
export { createCtCatalog } from "./catalog-connector";
export { BALANCE_PAYMENT_TYPE_KEY, createCtOrderPlacer, GIFT_ORDER_TYPE_KEY, orderWritesAllowed } from "./orders";
export { createCtOrganizationWrites } from "./organization-writes";
export { createCtOrganizations } from "./organizations";

/**
 * COMMERCE_CONNECTOR=commercetools. Settings: the CTP_* variables (the
 * project, its API client and CTP_STORE_KEY) and the sign-in client,
 * CTP_SIGNIN_CLIENT_ID and CTP_SIGNIN_CLIENT_SECRET. The catalog reads with
 * its own read-only client, CTP_API_CLIENT_ID, CTP_API_CLIENT_SECRET and
 * CTP_API_SCOPES; without it the connector has no catalog. Organizations
 * (companies, teams, roles) are read from Business Units with the API client
 * (`view_business_units`, `view_customers`), and changed with it
 * (`manage_business_units`, ADR 0017); names are changed on the store's
 * customer.
 */
export default defineConnector(({ env, log }) => {
  const ct = loadCtConfig(env);
  const catalogClient = env.CTP_API_CLIENT_ID?.trim() ? loadCtApiConfig(env) : null;
  const accounts = createCtAccounts({ api: createCtApi(ct), authUrl: ct.authUrl, projectKey: ct.projectKey, storeKey: ct.storeKey, signIn: loadSignInClientConfig(env) });
  return {
    id: "commercetools",
    contractVersion: CONTRACT_VERSION,
    capabilities: { signIn: "password" },
    accounts,
    ...(catalogClient ? { catalog: createCtCatalog(createCtApi(catalogClient)) } : {}),
    organizations: { ...createCtOrganizations(createCtApi(ct)), ...createCtOrganizationWrites(createCtApi(ct)) },
    orders: createCtOrderPlacer(createCtApi(ct), { allowWrites: orderWritesAllowed(ct), storeKey: ct.storeKey, ...(env.CTP_SHIPPING_METHOD_KEY ? { shippingMethodKey: env.CTP_SHIPPING_METHOD_KEY } : {}) }),
    async check() {
      // Refuse to start with an admin sign-in client: its customer tokens would carry full project access.
      await accounts.assertSignInClientScopes();
      log.info({ storeKey: ct.storeKey }, "commerce: commercetools customer accounts ready");
      if (catalogClient) log.info("commerce: commercetools catalog ready");
      else log.warn("commerce: CTP_API_CLIENT_ID is not set, so the commercetools catalog is off and the demo catalog is served");
    },
  };
});
