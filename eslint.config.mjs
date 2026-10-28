// Shared ESLint config for packages, services and infra. The Next.js apps
// have their own eslint.config.mjs built on eslint-config-next.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/dist/**", "**/node_modules/**", "**/.turbo/**", "apps/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Server code logs through @gifting/logger (see CLAUDE.md).
      "no-console": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
]);
