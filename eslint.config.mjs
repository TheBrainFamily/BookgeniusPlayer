import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import vitest from "eslint-plugin-vitest";
import convexPlugin from "@convex-dev/eslint-plugin";

// Get the directory of this config file (monorepo root)
const tsconfigRootDir = import.meta.dirname;

export default tseslint.config(
  // ===== GLOBAL IGNORES =====
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "convex/_generated/**",
      "compiled-books/**",
      "books/**",
      "**/downloads/**",
      "**/books-data/**",
      ".claude/**",
      ".opencode/**",
      ".husky/**",
      "**/*.d.ts",
      // Bundled/generated JS files
      "**/build-answer-server/**",
      "analyze-chapter-elements.js",
    ],
  },

  // ===== BASE: All TypeScript files =====
  // Use recommended (not strictTypeChecked) to avoid memory issues
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { tsconfigRootDir },
    },
    rules: {
      // ===== TYPE SAFETY (non-type-checked rules only) =====
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],

      // ===== CLEAN CODE PATTERNS =====
      // Note: This rule flags import() type annotations but can't auto-fix them
      // Those are intentional for dynamic imports and can be ignored
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports", disallowTypeAnnotations: false },
      ],

      // ===== COMPLEXITY LIMITS (AI guidance) =====
      complexity: ["error", { max: 20 }],
      "max-depth": ["error", { max: 5 }],
      "max-params": ["error", { max: 6 }],

      // ===== MODERN PATTERNS =====
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "warn",

      // ===== RELAXED FOR GRADUAL ADOPTION =====
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true, "ts-nocheck": true },
      ],
      "@typescript-eslint/no-require-imports": "off",

      // ===== TURNED OFF (TypeScript handles these) =====
      "no-undef": "off",
      "no-redeclare": "off",
      "no-func-assign": "off",
      "no-unsafe-optional-chaining": "off",
      "no-unsafe-finally": "off",

      // ===== TURNED OFF (intentional patterns or too many violations) =====
      "@typescript-eslint/no-unused-expressions": "off", // Many false positives with optional chaining
      "@typescript-eslint/no-this-alias": "off", // Used intentionally in some patterns
      "no-empty": ["error", { allowEmptyCatch: true }], // Allow empty catch blocks
      "no-console": "off", // Allow console in dev, enforce per-context
      "no-control-regex": "off", // Used intentionally for ANSI stripping
      "no-irregular-whitespace": "off", // Book content has special chars
      "no-cond-assign": "off", // Sometimes intentional (while assignments)
      "no-constant-condition": "off", // Used in while(true) patterns

      // ===== ERROR (catch regressions) =====
      "no-useless-escape": "error",
      "no-case-declarations": "error",
      "no-prototype-builtins": "error",
      "no-fallthrough": "error",
      "no-misleading-character-class": "error",
    },
  },

  // ===== REACT: Browser apps with JSX =====
  {
    files: [
      "apps/player/**/*.{ts,tsx}",
      "apps/platform/**/*.{ts,tsx}",
      "apps/bookgenius-cms/**/*.{ts,tsx}",
      "apps/pipeline-ui/**/*.{ts,tsx}",
    ],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, "react-hooks": reactHooks, "react-refresh": reactRefresh },
    settings: { react: { version: "detect" } },
    rules: {
      // React 19: No need for React import
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",

      // Hooks (critical)
      ...reactHooks.configs.recommended.rules,

      // React Refresh (Vite HMR)
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // React best practices
      "react/prop-types": "off",
      "react/jsx-key": ["error", { checkFragmentShorthand: true }],
      "react/no-array-index-key": "off",
      "react/self-closing-comp": "warn",

      // React 19 compiler rules (new, downgrade to warn for gradual adoption)
      // These are important but need codebase-wide fixes
      "react-hooks/rules-of-hooks": "error", // Keep as error - actual bugs
    },
  },

  // ===== CONVEX: Backend functions =====
  ...convexPlugin.configs.recommended,
  {
    files: ["convex/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Convex-specific
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_|^ctx$", varsIgnorePattern: "^_" },
      ],
    },
  },

  // ===== BUN RUNTIME: Server-side apps =====
  {
    files: ["apps/pipeline/**/*.ts", "apps/ffmpeg-worker/**/*.ts", "tools/**/*.ts"],
    languageOptions: { globals: { ...globals.node, Bun: "readonly" } },
    rules: {
      // No browser APIs in server code
      "no-restricted-globals": [
        "warn",
        "window",
        "document",
        "localStorage",
        "sessionStorage",
        "alert",
        "confirm",
        "prompt",
      ],
      "no-console": "off",
    },
  },

  // ===== CLOUDFLARE WORKERS =====
  {
    files: ["apps/webp-compressor/**/*.ts"],
    languageOptions: {
      globals: { ...globals.worker, Response: "readonly", Request: "readonly", fetch: "readonly" },
    },
  },

  // ===== TESTS: Relaxed rules =====
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}"],
    plugins: { vitest },
    languageOptions: { globals: { ...globals.node, ...vitest.environments.env.globals } },
    rules: {
      // Vitest rules
      "vitest/expect-expect": "error",
      "vitest/no-identical-title": "error",
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/valid-expect": "error",

      // Relaxed for tests
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // ===== CONFIG FILES: Node globals, relaxed =====
  {
    files: ["*.config.{js,mjs,ts}", "**/*.config.{js,mjs,ts}"],
    languageOptions: { globals: { ...globals.node } },
  },

  // ===== JAVASCRIPT FILES =====
  { files: ["**/*.{js,mjs,cjs}"], languageOptions: { globals: { ...globals.node } } },

  // ===== WORKLET FILES: AudioWorklet globals =====
  {
    files: ["**/*-worklet.js", "**/worklets/**/*.js"],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: "readonly",
        registerProcessor: "readonly",
        sampleRate: "readonly",
      },
    },
  },

  // ===== DEPLOY/TOOL SCRIPTS: Relaxed TSX rules (Ink components) =====
  {
    files: ["tools/**/*.tsx"],
    rules: {
      "react-hooks/exhaustive-deps": "off", // Ink components don't follow React rules exactly
    },
  },
);
