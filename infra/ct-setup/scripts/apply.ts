// pnpm ct:apply — creates the store, custom types, product type and vendor
// channels in the sandbox project from .env, skipping any that exist.
// Refuses any project key without "sandbox" or "dev" in it.
import { createCtApi, isNotFound, isSandboxProject, loadCtConfig } from "@gifting/ct";
import { AppError, createLogger } from "@gifting/logger";

import { channelDrafts, productTypeDraft, storeDraft, typeDrafts } from "../src/drafts";

const log = createLogger("ct:apply");

async function ensure(kind: string, key: string, exists: () => Promise<unknown>, create: () => Promise<unknown>) {
  try {
    await exists();
    log.info({ kind, key }, "exists, skipped");
  } catch (err) {
    if (!isNotFound(err)) throw err;
    await create();
    log.info({ kind, key }, "created");
  }
}

try {
  const config = loadCtConfig();
  if (!isSandboxProject(config.projectKey)) {
    throw new AppError("not_sandbox", "Refusing to set up a project whose key doesn't contain 'sandbox' or 'dev'.");
  }
  const api = createCtApi(config);

  for (const draft of typeDrafts) {
    await ensure(
      "type",
      draft.key,
      () => api.types().withKey({ key: draft.key }).get().execute(),
      () => api.types().post({ body: draft }).execute(),
    );
  }
  await ensure(
    "product-type",
    productTypeDraft.key!,
    () => api.productTypes().withKey({ key: productTypeDraft.key! }).get().execute(),
    () => api.productTypes().post({ body: productTypeDraft }).execute(),
  );
  for (const draft of channelDrafts) {
    await ensure(
      "channel",
      draft.key,
      () => api.channels().withKey({ key: draft.key }).get().execute(),
      () => api.channels().post({ body: draft }).execute(),
    );
  }
  await ensure(
    "store",
    storeDraft.key,
    () => api.stores().withKey({ key: storeDraft.key }).get().execute(),
    () => api.stores().post({ body: storeDraft }).execute(),
  );
  log.info({ projectKey: config.projectKey }, "done");
} catch (err) {
  log.error({ err }, "ct:apply failed");
  process.exitCode = 1;
}
