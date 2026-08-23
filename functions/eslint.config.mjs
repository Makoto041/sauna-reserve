// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["lib/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Node 22 globals the Functions runtime provides.
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly",
        URLSearchParams: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      // The handlers log unknown errors; narrowing every one adds noise.
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
