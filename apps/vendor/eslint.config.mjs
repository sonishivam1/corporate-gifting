import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Apps never reach the database, commercetools or providers directly (CLAUDE.md).
      "no-restricted-imports": [
        "error",
        { patterns: ["@gifting/db", "@gifting/ct", "@gifting/channels", "@gifting/commerce", "@gifting/commerce-*", "@gifting/ledger", "@gifting/logger", "mongodb", "@commercetools/*"] },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
