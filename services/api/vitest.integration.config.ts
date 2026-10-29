import { defineConfig } from "vitest/config";

// Integration tests: each file gets its own throwaway gifting_test_* database
// on the MongoDB in MONGODB_URI (pnpm db:up locally, a service container in CI).
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
