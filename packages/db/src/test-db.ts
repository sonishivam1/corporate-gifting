import { randomBytes } from "node:crypto";

const TEST_PREFIX = "gifting_test_";

/** A fresh throwaway database name for one test file. */
export function testDbName(now = Date.now()): string {
  return `${TEST_PREFIX}${Math.floor(now / 1000)}_${randomBytes(3).toString("hex")}`;
}

/**
 * Refuses anything that isn't a throwaway test database, before a test
 * creates, writes or drops it.
 */
export function assertTestDb(name: string, appDbName = process.env.MONGODB_DB ?? "gifting"): void {
  if (!name.startsWith(TEST_PREFIX) || name === appDbName) {
    throw new Error(`Refusing to use "${name}" in tests: only ${TEST_PREFIX}* databases are allowed.`);
  }
}
