import { CONTRACT_VERSION, defineConnector } from "@gifting/commerce";
import { createCtApi, loadCtApiConfig, loadCtConfig } from "@gifting/ct";

import { createCtAccounts, loadSignInClientConfig } from "./accounts";
import { createCtCatalog } from "./catalog-connector";

export { createCtAccounts, loadSignInClientConfig, signInScopeProblem } from "./accounts";
export { createCtCatalog } from "./catalog-connector";

/**
 * COMMERCE_CONNECTOR=commercetools. Settings: the CTP_* variables (the
 * project, its API client and CTP_STORE_KEY) and the sign-in client,
 * CTP_SIGNIN_CLIENT_ID and CTP_SIGNIN_CLIENT_SECRET. The catalog reads with
 * its own read-only client, CTP_API_CLIENT_ID, CTP_API_CLIENT_SECRET and
 * CTP_API_SCOPES; without it the connector has no catalog.
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
    async check() {
      // Refuse to start with an admin sign-in client: its customer tokens would carry full project access.
      await accounts.assertSignInClientScopes();
      log.info({ storeKey: ct.storeKey }, "commerce: commercetools customer accounts ready");
      if (catalogClient) log.info("commerce: commercetools catalog ready");
      else log.warn("commerce: CTP_API_CLIENT_ID is not set, so the commercetools catalog is off and the demo catalog is served");
    },
  };
});
