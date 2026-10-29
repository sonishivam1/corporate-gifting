// pnpm seed — imports the fictional demo data into the commercetools project
// from .env through the Import API, then waits for commercetools to process
// it: the fictional vendors' products and stock, the demo customers, and the
// demo companies and teams as Business Units with those customers as
// associates. Re-running updates the same resources (keys are SKUs, customer
// and unit keys). Run pnpm ct:apply first: it creates the product type, tax
// category, gift categories, vendor channels, associate roles and the
// company and team custom types this data refers to.
import { createCtApi, loadCtConfig, maySetUpProject, NOT_SETUP_PROJECT_MESSAGE } from "@gifting/ct";
import { createCtImportApi, importRequests, runImport } from "@gifting/ct/import";
import { AppError, createLogger } from "@gifting/logger";

import { businessUnitImports } from "../src/business-units";
import { customerImport, demoCustomers } from "../src/customers";
import { inventoryImport, productDraftImport } from "../src/import";
import { products } from "../src/index";

const log = createLogger("seed");

try {
  const config = loadCtConfig();
  if (!maySetUpProject(config)) throw new AppError("not_sandbox", NOT_SETUP_PROJECT_MESSAGE);

  const customers = demoCustomers();
  // The Import API can't update a team unit: it always tries to reset the
  // team's stores, which commercetools refuses for teams that inherit them.
  // So teams are imported only when they don't exist yet; companies update.
  const units = businessUnitImports(customers);
  const teamKeys = units.filter((u) => u.unitType === "Division").map((u) => u.key);
  const existing = (await createCtApi(config).businessUnits().get({ queryArgs: { where: `key in (${teamKeys.map((k) => `"${k}"`).join(", ")})`, limit: 500 } }).execute()).body.results.map((u) => u.key);
  const toImport = units.filter((u) => u.unitType === "Company" || !existing.includes(u.key));
  if (existing.length > 0) log.info({ teams: existing.length }, "existing teams left as they are");

  const run = await runImport(createCtImportApi(config), "seed", [
    ...importRequests("product-draft", products.map(productDraftImport)),
    ...importRequests("inventory", products.map(inventoryImport)),
    ...importRequests("customer", customers.map(customerImport)),
    ...importRequests("business-unit", toImport),
  ]);
  log.info({ importContainerKey: run.importContainerKey, products: products.length, customers: customers.length, total: run.summary.total, ...run.summary.states }, "processed");

  for (const op of run.failed) log.error({ resourceKey: op.resourceKey, state: op.state, errors: op.errors?.map((e) => `${e.code}: ${e.message}`) }, "not imported");
  if (run.summary.states.imported !== run.summary.total) {
    throw new AppError("import_incomplete", `${run.summary.total - run.summary.states.imported} of ${run.summary.total} operations were not imported.`);
  }
} catch (err) {
  log.error({ err }, "seed failed");
  process.exitCode = 1;
}
