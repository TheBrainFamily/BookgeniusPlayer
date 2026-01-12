/**
 * Vite Library Build Configuration
 *
 * Builds the player as an embeddable library for npm distribution.
 * Output:
 * - dist-lib/index.js - ESM bundle (React components)
 * - dist-lib/styles.css - Pre-compiled CSS (Tailwind + custom styles)
 * - dist-lib/index.d.ts - TypeScript declarations
 *
 * Usage by consumers:
 *   import { LiveModeAppCore, PlayerDOMProvider } from '@bookgenius/player';
 *   import '@bookgenius/player/styles.css';
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      "@player": path.resolve(__dirname, "./src"),
      "@books-generator": path.resolve(__dirname, "../books-generator/src"),
      "@convex": path.resolve(__dirname, "../../convex"),
    },
  },
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    sourcemap: true,
    // Library mode configuration
    lib: {
      entry: path.resolve(__dirname, "src/lib/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      // Externalize peer dependencies - consumers must provide these
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "convex",
        "convex/react",
        // Don't bundle these large deps - let consumer tree-shake
        "motion",
        "motion/react",
        "zustand",
        "i18next",
        "react-i18next",
        "lucide-react",
        // Radix UI components
        /^@radix-ui\//,
        // OpenAI agents has Vite-specific code
        "@openai/agents-realtime",
      ],
      output: {
        // Preserve module structure for better tree-shaking
        preserveModules: false,
        // Name CSS file as styles.css (Vite extracts all CSS into one file with cssCodeSplit: false)
        assetFileNames: "styles.[ext]",
      },
    },
    // Don't minify for better debugging and smaller diffs
    minify: false,
    // CSS code splitting disabled - we want one CSS file
    cssCodeSplit: false,
  },
});
