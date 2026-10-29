import { defineConfig } from "vitest/config";

// The conformance suite against the project in the root .env (see conformance.sandbox.test.ts).
process.loadEnvFile(new URL("../../.env", import.meta.url));

export default defineConfig({ test: { include: ["src/**/*.sandbox.test.ts"], fileParallelism: false } });
