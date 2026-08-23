// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["lib/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      // Only reaches .mjs/.js here: tseslint's recommended preset turns
      // no-undef off for TypeScript, where the compiler already checks it.
      globals: globals.node,
    },
    rules: {
      // `any` erases the type checking the rest of the codebase relies on;
      // unknown plus a narrowing check is the pattern used in the handlers.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      eqeqeq: ["error", "smart"],
      "no-console": "off",
    },
  },
);
