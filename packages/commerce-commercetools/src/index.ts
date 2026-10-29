import { CONTRACT_VERSION, defineConnector } from "@gifting/commerce";
import { createCtApi, loadCtConfig } from "@gifting/ct";

import { createCtAccounts, loadSignInClientConfig } from "./accounts";

export { createCtAccounts, loadSignInClientConfig, signInScopeProblem } from "./accounts";

/**
 * COMMERCE_CONNECTOR=commercetools. Settings: the CTP_* variables (the
 * project, its API client and CTP_STORE_KEY) and the sign-in client,
 * CTP_SIGNIN_CLIENT_ID and CTP_SIGNIN_CLIENT_SECRET.
 */
export default defineConnector(({ env, log }) => {
  const ct = loadCtConfig(env);
  const accounts = createCtAccounts({ api: createCtApi(ct), authUrl: ct.authUrl, projectKey: ct.projectKey, storeKey: ct.storeKey, signIn: loadSignInClientConfig(env) });
  return {
    id: "commercetools",
    contractVersion: CONTRACT_VERSION,
    capabilities: { signIn: "password" },
    accounts,
    async check() {
      // Refuse to start with an admin sign-in client: its customer tokens would carry full project access.
      await accounts.assertSignInClientScopes();
      log.info({ storeKey: ct.storeKey }, "commerce: commercetools customer accounts ready");
    },
  };
});
