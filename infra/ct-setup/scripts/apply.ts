// pnpm ct:apply — sets up the project from .env: custom types, product types,
// tax, the US zone and shipping, vendor channels, the store, associate roles
// and the gift categories. Creates what is missing and adds fields or
// attributes that existing types lack; never changes or deletes anything
// else, so it is safe to re-run. Refuses any project key without "sandbox" or
// "dev" in it, unless CTP_SETUP_PROJECT_KEY names that exact project.
import { createCtApi, isNotFound, loadCtConfig, maySetUpProject, NOT_SETUP_PROJECT_MESSAGE } from "@gifting/ct";
import { AppError, createLogger } from "@gifting/logger";

import {
  associateRoleDrafts,
  categoryDrafts,
  channelDrafts,
  productTypeDrafts,
  shippingMethodDraft,
  storeDraft,
  taxCategoryDraft,
  typeDrafts,
  zoneDraft,
} from "../src/drafts";

const log = createLogger("ct:apply");

/** Gets the resource, or creates it when it doesn't exist. Returns it either way. */
async function ensure<T>(kind: string, key: string, get: () => Promise<{ body: T }>, create: () => Promise<{ body: T }>): Promise<T> {
  try {
    const { body } = await get();
    log.info({ kind, key }, "exists");
    return body;
  } catch (err) {
    if (!isNotFound(err)) throw err;
    const { body } = await create();
    log.info({ kind, key }, "created");
    return body;
  }
}

try {
  const config = loadCtConfig();
  if (!maySetUpProject(config)) throw new AppError("not_sandbox", NOT_SETUP_PROJECT_MESSAGE);
  const api = createCtApi(config);

  for (const draft of typeDrafts) {
    const type = await ensure("type", draft.key, () => api.types().withKey({ key: draft.key }).get().execute(), () => api.types().post({ body: draft }).execute());
    const have = new Set(type.fieldDefinitions.map((f) => f.name));
    const missing = (draft.fieldDefinitions ?? []).filter((f) => !have.has(f.name));
    if (missing.length > 0) {
      await api.types().withKey({ key: draft.key }).post({ body: { version: type.version, actions: missing.map((fieldDefinition) => ({ action: "addFieldDefinition", fieldDefinition })) } }).execute();
      log.info({ kind: "type", key: draft.key, added: missing.map((f) => f.name) }, "fields added");
    }
  }

  for (const draft of productTypeDrafts) {
    const key = draft.key!;
    const productType = await ensure("product-type", key, () => api.productTypes().withKey({ key }).get().execute(), () => api.productTypes().post({ body: draft }).execute());
    const have = new Set(productType.attributes?.map((a) => a.name));
    const missing = (draft.attributes ?? []).filter((a) => !have.has(a.name));
    if (missing.length > 0) {
      await api.productTypes().withKey({ key }).post({ body: { version: productType.version, actions: missing.map((attribute) => ({ action: "addAttributeDefinition", attribute })) } }).execute();
      log.info({ kind: "product-type", key, added: missing.map((a) => a.name) }, "attributes added");
    }
  }

  await ensure("tax-category", taxCategoryDraft.key!, () => api.taxCategories().withKey({ key: taxCategoryDraft.key! }).get().execute(), () => api.taxCategories().post({ body: taxCategoryDraft }).execute());
  await ensure("zone", zoneDraft.key!, () => api.zones().withKey({ key: zoneDraft.key! }).get().execute(), () => api.zones().post({ body: zoneDraft }).execute());
  await ensure(
    "shipping-method",
    shippingMethodDraft.key!,
    () => api.shippingMethods().withKey({ key: shippingMethodDraft.key! }).get().execute(),
    () => api.shippingMethods().post({ body: shippingMethodDraft }).execute(),
  );

  for (const draft of channelDrafts) {
    await ensure("channel", draft.key, () => api.channels().withKey({ key: draft.key }).get().execute(), () => api.channels().post({ body: draft }).execute());
  }

  // The store sees stock at every vendor's supply channel, including vendors
  // added by a catalog import.
  const store = await ensure("store", storeDraft.key, () => api.stores().withKey({ key: storeDraft.key }).get().execute(), () => api.stores().post({ body: storeDraft }).execute());
  const supply = (await api.channels().get({ queryArgs: { where: `roles contains any ("InventorySupply")`, limit: 500 } }).execute()).body.results;
  const linked = new Set(store.supplyChannels.map((c) => c.id));
  const toAdd = supply.filter((c) => !linked.has(c.id));
  if (toAdd.length > 0) {
    await api.stores().withKey({ key: storeDraft.key }).post({ body: { version: store.version, actions: toAdd.map((c) => ({ action: "addSupplyChannel", supplyChannel: { typeId: "channel", id: c.id } })) } }).execute();
    log.info({ kind: "store", key: storeDraft.key, added: toAdd.map((c) => c.key) }, "supply channels added");
  }

  for (const draft of associateRoleDrafts) {
    await ensure("associate-role", draft.key, () => api.associateRoles().withKey({ key: draft.key }).get().execute(), () => api.associateRoles().post({ body: draft }).execute());
  }
  for (const draft of categoryDrafts) {
    await ensure("category", draft.key!, () => api.categories().withKey({ key: draft.key! }).get().execute(), () => api.categories().post({ body: draft }).execute());
  }
  log.info({ projectKey: config.projectKey }, "done");
} catch (err) {
  log.error({ err }, "ct:apply failed");
  process.exitCode = 1;
}
