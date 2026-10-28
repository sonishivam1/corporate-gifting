// pnpm db:indexes — creates every index in INDEXES on the configured database.
import { createLogger } from "@gifting/logger";

import { closeClient, ensureIndexes, getDb } from "../src/index";

const log = createLogger("db:indexes");

try {
  await ensureIndexes(getDb());
  log.info("done");
} catch (err) {
  log.error({ err }, "failed");
  process.exitCode = 1;
} finally {
  await closeClient();
}
