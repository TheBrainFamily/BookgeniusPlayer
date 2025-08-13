import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config({ ignores: ["**/node_modules", "**/dist", "**/build", "**/coverage"] }, ...tseslint.configs.recommended, {
  files: ["apps/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    globals: globals.browser,
    parserOptions: {
      // no projectService here → syntax-only linting
    },
  },
});
