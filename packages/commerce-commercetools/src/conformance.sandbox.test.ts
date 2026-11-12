// The conformance suite against the real commercetools project in the root
// .env. Run with `pnpm test:conformance`; never part of `pnpm test` or CI.
// It creates customers in the store with `.example` emails and deletes them.
import { describeConnectorConformance } from "@gifting/commerce/conformance";
import { createCtApi, loadCtConfig } from "@gifting/ct";
import { createLogger } from "@gifting/logger";

import connector from "./index";

const run = Date.now().toString(36);
let n = 0;
const writesCustomers: string[] = [];

describeConnectorConformance("commercetools (sandbox)", {
  connector: () => connector({ env: process.env, log: createLogger("conformance", {}, { level: "silent" }), production: false }),
  newEmail: () => `conformance-${run}-${++n}@gifting-conformance.example`,
  timeoutMs: 15_000,
  // The demo company's first associate (`pnpm seed`).
  organizations: {
    async customerId() {
      const api = createCtApi(loadCtConfig(process.env));
      const unit = (await api.businessUnits().withKey({ key: "company-lumen-labs" }).get().execute()).body;
      const id = unit.associates[0]?.customer.id;
      if (!id) throw new Error("company-lumen-labs has no associates; run pnpm seed.");
      return id;
    },
  },
  // Writes (ADR 0017): a customer made for the run gets and loses a sender role on the demo company's first
  // team, and a team made for the run is deleted afterwards. The customer is deleted with the others.
  organizationWrites: {
    companyKey: "company-lumen-labs",
    teamKey: "team-lumen-people",
    async customerId() {
      const ct = loadCtConfig(process.env);
      const api = createCtApi(ct);
      const email = `conformance-${run}-writes@gifting-conformance.example`;
      const draft = { email, password: "Conformance-Check-2026!", firstName: "Role", lastName: "Check" };
      const created = (await api.inStoreKeyWithStoreKeyValue({ storeKey: ct.storeKey }).customers().post({ body: draft }).execute()).body.customer;
      writesCustomers.push(created.id);
      return created.id;
    },
    newTeamKey: () => `team-conformance-${run}-${++n}`,
    async cleanupTeams(keys) {
      const api = createCtApi(loadCtConfig(process.env));
      for (const key of keys) {
        const { version } = (await api.businessUnits().withKey({ key }).get().execute()).body;
        await api.businessUnits().withKey({ key }).delete({ queryArgs: { version } }).execute();
      }
    },
  },
  async cleanup(ids) {
    ids = [...ids, ...writesCustomers];
    const api = createCtApi(loadCtConfig(process.env));
    for (const id of ids) {
      const { version } = (await api.customers().withId({ ID: id }).get().execute()).body;
      await api.customers().withId({ ID: id }).delete({ queryArgs: { version } }).execute();
    }
  },
});
