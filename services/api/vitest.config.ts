import { defineConfig } from "vitest/config";

// Unit tests only: no database, no network. Integration tests have their own
// config (vitest.integration.config.ts) and run with pnpm test:integration.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
