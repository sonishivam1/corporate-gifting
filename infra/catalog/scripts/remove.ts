// pnpm catalog:remove — deletes everything pnpm catalog:import created for
// Christie Cookie from the commercetools project in .env: the products (and
// so their prices and images), the stock at the vendor channel, the
// categories and the channel. For when the client withdraws permission, or
// to start clean. Reads the keys from the snapshot.
import { readFile } from "node:fs/promises";

import { createCtApi, isNotFound, loadCtConfig, maySetUpProject, NOT_SETUP_PROJECT_MESSAGE } from "@gifting/ct";
import { AppError, createLogger } from "@gifting/logger";

import { catalogSnapshotSchema, snapshotPath } from "../src/snapshot";

const log = createLogger("catalog:remove");

/** Runs `action`, treating "not found" as already removed. */
async function gone(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

try {
  const config = loadCtConfig();
  if (!maySetUpProject(config)) throw new AppError("not_sandbox", NOT_SETUP_PROJECT_MESSAGE);
  const snapshot = catalogSnapshotSchema.parse(JSON.parse(await readFile(snapshotPath("christie-cookie"), "utf8")));
  const api = createCtApi(config);

  let products = 0;
  for (const { key } of snapshot.products) {
    const removed = await gone(async () => {
      let product = (await api.products().withKey({ key }).get().execute()).body;
      if (product.masterData.published) {
        product = (await api.products().withKey({ key }).post({ body: { version: product.version, actions: [{ action: "unpublish" }] } }).execute()).body;
      }
      await api.products().withKey({ key }).delete({ queryArgs: { version: product.version } }).execute();
    });
    if (removed) products += 1;
  }

  let inventory = 0;
  const channel = await api.channels().withKey({ key: snapshot.vendor.key }).get().execute().catch((err: unknown) => {
    if (isNotFound(err)) return undefined;
    throw err;
  });
  if (channel) {
    for (;;) {
      const page = await api.inventory().get({ queryArgs: { where: `supplyChannel(id="${channel.body.id}")`, limit: 500 } }).execute();
      if (page.body.results.length === 0) break;
      for (const entry of page.body.results) {
        await api.inventory().withId({ ID: entry.id }).delete({ queryArgs: { version: entry.version } }).execute();
        inventory += 1;
      }
    }
  }

  // Children before parents, the root last.
  let categories = 0;
  const depth = (path: string) => path.split("/").length;
  const keys = [...snapshot.categories].sort((a, b) => depth(b.path) - depth(a.path)).map((c) => c.key);
  for (const key of [...keys, snapshot.rootCategory.key]) {
    const removed = await gone(async () => {
      const category = (await api.categories().withKey({ key }).get().execute()).body;
      await api.categories().withKey({ key }).delete({ queryArgs: { version: category.version } }).execute();
    });
    if (removed) categories += 1;
  }

  if (channel) await api.channels().withId({ ID: channel.body.id }).delete({ queryArgs: { version: channel.body.version } }).execute();
  log.info({ products, inventory, categories, channel: channel ? snapshot.vendor.key : null }, "removed");
} catch (err) {
  log.error({ err }, "catalog:remove failed");
  process.exitCode = 1;
}
