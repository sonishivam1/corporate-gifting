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
  {
    // Commerce goes through connectors (docs/plans/commerce-connectors.md):
    // only a connector package touches a platform's SDK, and only the API's
    // generated connector list names a connector. Setup scripts in infra/ are
    // platform tooling and may use @gifting/ct.
    files: ["services/**", "packages/**"],
    ignores: ["packages/ct/**", "packages/commerce-*/**", "services/api/src/commerce/installed.ts", "**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@gifting/ct", "@gifting/ct/*", "@commercetools/*", "@gifting/commerce-*"],
              message: "Commerce goes through the connector contract (@gifting/commerce). Platform code belongs in a @gifting/commerce-<platform> package.",
            },
          ],
        },
      ],
    },
  },
  {
    // Tests may stand a platform in with the memory connector, and nothing else.
    files: ["services/**/*.test.ts", "packages/**/*.test.ts"],
    ignores: ["packages/ct/**", "packages/commerce-*/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@gifting/ct", "@gifting/ct/*", "@commercetools/*", "@gifting/commerce-*", "!@gifting/commerce-memory"],
              message: "Tests use @gifting/commerce-memory, never a real platform.",
            },
          ],
        },
      ],
    },
  },
]);
