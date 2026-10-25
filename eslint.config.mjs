import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/auth/**", "src/lib/db/trusted.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/db/trusted", "**/db/trusted"],
              message:
                "trusted.ts bypasses RLS. Only auth code may import it — use withTenant from @/lib/db/client instead.",
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
]);

export default eslintConfig;
