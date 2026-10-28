// pnpm ct:apply — creates the store, custom types, product type and vendor
// channels in the project from .env, skipping any that exist. Refuses any
// project key without "sandbox" or "dev" in it, unless CTP_SETUP_PROJECT_KEY
// names that exact project.
import { createCtApi, isNotFound, loadCtConfig, maySetUpProject, NOT_SETUP_PROJECT_MESSAGE } from "@gifting/ct";
import { AppError, createLogger } from "@gifting/logger";

import { channelDrafts, productTypeDrafts, storeDraft, typeDrafts } from "../src/drafts";

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
  if (!maySetUpProject(config)) throw new AppError("not_sandbox", NOT_SETUP_PROJECT_MESSAGE);
  const api = createCtApi(config);

  for (const draft of typeDrafts) {
    await ensure(
      "type",
      draft.key,
      () => api.types().withKey({ key: draft.key }).get().execute(),
      () => api.types().post({ body: draft }).execute(),
    );
  }
  for (const draft of productTypeDrafts) {
    await ensure(
      "product-type",
      draft.key!,
      () => api.productTypes().withKey({ key: draft.key! }).get().execute(),
      () => api.productTypes().post({ body: draft }).execute(),
    );
  }
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
