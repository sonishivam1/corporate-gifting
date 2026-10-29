import { configDefaults, defineConfig } from "vitest/config";

// `pnpm test` never reaches commercetools: the sandbox suite runs only with `pnpm test:conformance`.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, "**/*.sandbox.test.ts"] } });
