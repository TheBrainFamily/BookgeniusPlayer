import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import vitest from "eslint-plugin-vitest";
import convexPlugin from "@convex-dev/eslint-plugin";

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
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    rules: {
      // ===== TYPE SAFETY (non-type-checked rules only) =====
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],

      // ===== CLEAN CODE PATTERNS =====
      // Note: This rule flags import() type annotations but can't auto-fix them
      // Those are intentional for dynamic imports and can be ignored
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports", disallowTypeAnnotations: false },
      ],

      // ===== COMPLEXITY LIMITS (AI guidance) =====
      complexity: ["warn", { max: 20 }],
      "max-depth": ["warn", { max: 5 }],
      "max-params": ["warn", { max: 6 }],

      // ===== MODERN PATTERNS =====
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "warn",

      // ===== RELAXED FOR GRADUAL ADOPTION =====
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true, "ts-nocheck": true },
      ],
      "@typescript-eslint/no-require-imports": "off",

      // ===== TURNED OFF (from base configs, too noisy for gradual adoption) =====
      // These come from eslint:recommended and cause many errors in existing code
      "@typescript-eslint/no-unused-expressions": "off", // Many false positives with optional chaining
      "@typescript-eslint/no-this-alias": "off", // Used intentionally in some patterns
      "no-empty": "off", // Empty catch blocks are intentional sometimes
      "no-console": "off", // Allow console in dev, enforce via custom rules where needed
      "no-func-assign": "off", // TypeScript already catches this
      "no-undef": "off", // TypeScript handles this
      "no-redeclare": "off", // TypeScript handles this
      "no-case-declarations": "off", // Can be fixed incrementally
      "no-prototype-builtins": "off", // Rarely an actual issue
      "no-fallthrough": "off", // Sometimes intentional
      "no-unsafe-finally": "off", // TypeScript catches most issues
      "no-useless-escape": "warn", // Downgrade to warning (auto-fixable)
      "no-control-regex": "off", // Used intentionally for ANSI stripping
      "no-irregular-whitespace": "off", // Book content has special chars
      "no-misleading-character-class": "off", // Rare edge case
      "no-cond-assign": "off", // Sometimes intentional (while assignments)
      "no-constant-condition": "off", // Used in while(true) patterns
      "no-unsafe-optional-chaining": "off", // TypeScript handles this
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
      "react/jsx-key": ["warn", { checkFragmentShorthand: true }],
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
      "no-console": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
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
      "vitest/expect-expect": "warn",
      "vitest/no-identical-title": "error",
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "warn",
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
