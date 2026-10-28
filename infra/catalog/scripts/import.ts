// pnpm catalog:import — imports the Christie Cookie snapshot
// (.data/catalogs/christie-cookie.json, from pnpm catalog:extract) into the
// commercetools project from .env: the vendor channel, its categories, its
// products with images and prices, and their stock. Re-running updates the
// same resources. Run pnpm ct:apply first (it creates the cookie-tin product
// type and the vendor channel type).
import { readFile } from "node:fs/promises";

import { createCtApi, isNotFound, loadCtConfig, maySetUpProject, NOT_SETUP_PROJECT_MESSAGE } from "@gifting/ct";
import { vendorChannelDraft } from "@gifting/ct-setup";
import { createCtImportApi, importRequests, runImport } from "@gifting/ct/import";
import { AppError, createLogger } from "@gifting/logger";

import { CHRISTIE_GIFTING } from "../src/christie";
import { categoryImports, inventoryImports, productDraftImport } from "../src/import";
import { catalogSnapshotSchema, snapshotPath } from "../src/snapshot";

const log = createLogger("catalog:import");

try {
  const config = loadCtConfig();
  if (!maySetUpProject(config)) throw new AppError("not_sandbox", NOT_SETUP_PROJECT_MESSAGE);
  const snapshot = catalogSnapshotSchema.parse(JSON.parse(await readFile(snapshotPath("christie-cookie"), "utf8")));

  const api = createCtApi(config);
  try {
    await api.productTypes().withKey({ key: "cookie-tin" }).get().execute();
  } catch (err) {
    if (isNotFound(err)) throw new AppError("missing_product_type", "The cookie-tin product type is missing; run pnpm ct:apply first.");
    throw err;
  }
  try {
    await api.channels().withKey({ key: snapshot.vendor.key }).get().execute();
  } catch (err) {
    if (!isNotFound(err)) throw err;
    await api.channels().post({ body: vendorChannelDraft(snapshot.vendor) }).execute();
    log.info({ channel: snapshot.vendor.key }, "vendor channel created");
  }

  const categories = categoryImports(snapshot);
  const products = snapshot.products.map((p) => productDraftImport(p, snapshot, CHRISTIE_GIFTING));
  const inventory = inventoryImports(snapshot);
  const run = await runImport(createCtImportApi(config), "christie", [
    ...importRequests("category", categories),
    ...importRequests("product-draft", products),
    ...importRequests("inventory", inventory),
  ]);
  log.info(
    { importContainerKey: run.importContainerKey, categories: categories.length, products: products.length, inventory: inventory.length, total: run.summary.total, ...run.summary.states },
    "processed",
  );

  for (const op of run.failed) {
    log.error({ resourceKey: op.resourceKey, state: op.state, errors: op.errors?.map((e) => `${e.code}: ${e.message}`) }, "not imported");
  }
  if (run.summary.states.imported !== run.summary.total) {
    throw new AppError("import_incomplete", `${run.summary.total - run.summary.states.imported} of ${run.summary.total} operations were not imported.`);
  }
} catch (err) {
  log.error({ err }, "catalog:import failed");
  process.exitCode = 1;
}
