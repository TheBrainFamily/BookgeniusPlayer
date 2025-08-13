// apps/player/eslint.config.mjs
import globals from "globals";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { fileURLToPath } from "node:url";
import path from "node:path";

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  { ignores: ["dist"] },

  // Good TS defaults
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // React Hooks rules
      ...reactHooks.configs.recommended.rules,

      // React 17+/19: no need to import React for JSX
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",

      // Nice DX with Vite/fast refresh
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // TS-eslint: keep this lean; rely on TS where possible
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  }
);