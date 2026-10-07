import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // The domain package is pure: no framework, database, network or Node APIs.
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!zod$|\\.{1,2}/)",
              message:
                "packages/domain must stay pure: only zod and relative imports are allowed.",
            },
          ],
        },
      ],
    },
  },
]);
