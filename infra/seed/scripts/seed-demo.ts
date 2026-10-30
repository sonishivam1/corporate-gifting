// pnpm seed:demo — writes the demo company's platform data to the local
// MongoDB (see src/write-demo.ts). Safe to run as often as you like.
import { closeClient, getDb } from "@gifting/db";
import { createLogger } from "@gifting/logger";

import { writeDemoActivity } from "../src/write-activity";
import { writeDemoData } from "../src/write-demo";

const log = createLogger("seed:demo");

try {
  const db = getDb();
  const counts = await writeDemoData(db);
  log.info({ db: db.databaseName, ...counts }, "demo data written");
  // Sent campaigns and gifts over the last 30 days, for the Home overview.
  const activity = await writeDemoActivity(db);
  log.info({ db: db.databaseName, ...activity }, "demo activity written");
} catch (err) {
  log.error({ err }, "seed:demo failed");
  process.exitCode = 1;
} finally {
  await closeClient();
}
