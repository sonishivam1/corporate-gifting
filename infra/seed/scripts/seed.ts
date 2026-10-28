// pnpm seed — imports the fictional vendors' products and stock, and the
// fictional demo customers, into the commercetools project from .env through
// the Import API, then waits for commercetools to process them. Re-running
// updates the same resources (keys are SKUs and customer keys). Run
// pnpm ct:apply first: products need the gift-item product type and stock
// needs the vendor channels.
import { loadCtConfig, maySetUpProject, NOT_SETUP_PROJECT_MESSAGE } from "@gifting/ct";
import { createCtImportApi, importRequests, runImport } from "@gifting/ct/import";
import { AppError, createLogger } from "@gifting/logger";

import { customerImport, demoCustomers } from "../src/customers";
import { inventoryImport, productDraftImport } from "../src/import";
import { products } from "../src/index";

const log = createLogger("seed");

try {
  const config = loadCtConfig();
  if (!maySetUpProject(config)) throw new AppError("not_sandbox", NOT_SETUP_PROJECT_MESSAGE);

  const customers = demoCustomers();
  const run = await runImport(createCtImportApi(config), "seed", [
    ...importRequests("product-draft", products.map(productDraftImport)),
    ...importRequests("inventory", products.map(inventoryImport)),
    ...importRequests("customer", customers.map(customerImport)),
  ]);
  log.info({ importContainerKey: run.importContainerKey, products: products.length, customers: customers.length, total: run.summary.total, ...run.summary.states }, "processed");

  for (const op of run.failed) log.error({ resourceKey: op.resourceKey, state: op.state, errors: op.errors?.map((e) => e.code) }, "not imported");
  if (run.summary.states.imported !== run.summary.total) {
    throw new AppError("import_incomplete", `${run.summary.total - run.summary.states.imported} of ${run.summary.total} operations were not imported.`);
  }
} catch (err) {
  log.error({ err }, "seed failed");
  process.exitCode = 1;
}
