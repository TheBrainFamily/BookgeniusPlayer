/**
 * BookGenius Player - Tailwind Preset
 *
 * For consumers who use Tailwind and want CSS tree-shaking instead of
 * importing the pre-built styles.css bundle.
 *
 * Usage (Tailwind v4 - CSS-first):
 * ```css
 * @import "tailwindcss";
 * @source "node_modules/@bookgenius/player/dist-lib/*.js";
 * @import "@bookgenius/player/dist-lib/tailwind-config.css";
 * ```
 *
 * Usage (Tailwind v3 - JS config):
 * ```js
 * // tailwind.config.js
 * module.exports = {
 *   content: [
 *     './src/**\/*.{js,ts,jsx,tsx}',
 *     './node_modules/@bookgenius/player/dist-lib/**\/*.js',
 *   ],
 *   presets: [require('@bookgenius/player/tailwind-preset')],
 * };
 * ```
 *
 * Note: The player uses Tailwind v4 internally with CSS-first configuration.
 * For best compatibility, we recommend using the pre-built styles.css:
 *
 *   import '@bookgenius/player/styles.css';
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      // Custom breakpoint
      screens: { xxl: "90rem" },
      // Book theme colors - these map to CSS variables set at runtime
      colors: {
        book: {
          primary: "var(--book-primary-color)",
          secondary: "var(--book-secondary-color)",
          tertiary: "var(--book-tertiary-color)",
          quaternary: "var(--book-quaternary-color)",
          "simplified-icon": "var(--book-simplified-icon-color)",
        },
      },
      // Border radius using CSS variable
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
      },
      // Animation tokens
      animation: {
        "pulse-glow": "pulseGlow 3s infinite ease-in-out",
        "search-highlight-fade": "searchHighlightFade 4s ease-in-out forwards",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { filter: "drop-shadow(0 0 7px rgba(var(--book-primary-color-rgb), 0.5))" },
          "50%": {
            filter:
              "drop-shadow(0 0 10px rgba(var(--book-primary-color-rgb), 0.7)) drop-shadow(0 0 15px rgba(var(--book-primary-color-rgb), 0.4))",
          },
        },
        searchHighlightFade: {
          "0%": {
            backgroundColor: "var(--highlight-blink-color)",
            boxShadow: "0 0 8px var(--highlight-blink-color)",
          },
          "100%": { backgroundColor: "transparent", boxShadow: "none", color: "inherit" },
        },
      },
    },
  },
  plugins: [],
};
