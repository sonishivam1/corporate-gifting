// The conformance suite against the real commercetools project in the root
// .env. Run with `pnpm test:conformance`; never part of `pnpm test` or CI.
// It creates customers in the store with `.example` emails and deletes them.
import { describeConnectorConformance } from "@gifting/commerce/conformance";
import { createCtApi, loadCtConfig } from "@gifting/ct";
import { createLogger } from "@gifting/logger";

import connector from "./index";

const run = Date.now().toString(36);
let n = 0;

describeConnectorConformance("commercetools (sandbox)", {
  connector: () => connector({ env: process.env, log: createLogger("conformance", {}, { level: "silent" }), production: false }),
  newEmail: () => `conformance-${run}-${++n}@gifting-conformance.example`,
  timeoutMs: 15_000,
  async cleanup(ids) {
    const api = createCtApi(loadCtConfig(process.env));
    for (const id of ids) {
      const { version } = (await api.customers().withId({ ID: id }).get().execute()).body;
      await api.customers().withId({ ID: id }).delete({ queryArgs: { version } }).execute();
    }
  },
});
