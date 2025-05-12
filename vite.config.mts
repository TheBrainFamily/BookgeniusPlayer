import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy, type Target } from "vite-plugin-static-copy";

import path from "path";
import fs from "fs";

// Import BOOK_SLUGS directly, but CURRENT_BOOK will now be effectively determined here
import { BOOK_SLUGS } from "./src/consts"; // We only need the enum here

// --- START: Dynamic Book Configuration ---
const desiredBookSlug = process.env.VITE_BOOK;
let currentBookSlug: BOOK_SLUGS;

if (desiredBookSlug && Object.values(BOOK_SLUGS).includes(desiredBookSlug as BOOK_SLUGS)) {
  currentBookSlug = desiredBookSlug as BOOK_SLUGS;
  console.log(`Using book from VITE_BOOK environment variable: ${currentBookSlug}`);
} else {
  currentBookSlug = BOOK_SLUGS.PHARAON; // Default book
  if (desiredBookSlug) {
    console.warn(`VITE_BOOK="${desiredBookSlug}" is not a valid book slug. Defaulting to ${currentBookSlug}. Valid slugs are: ${Object.values(BOOK_SLUGS).join(", ")}`);
  } else {
    console.log(`VITE_BOOK environment variable not set or invalid. Defaulting to book: ${currentBookSlug}`);
  }
}
// --- END: Dynamic Book Configuration ---

// Workaround to remove unnecessary books chunks from the build
// ToDo: Do not create them in the first place
const removeChunksPlugin = () => {
  return {
    name: "remove-specified-chunks",
    apply: "build" as const,
    closeBundle() {
      console.log(`Removing chunks for books other than: ${currentBookSlug}`); // Use the resolved currentBookSlug
      const distDir = path.resolve(__dirname, "dist/assets");
      const toRemove = Object.values(BOOK_SLUGS)
        .filter((slug) => slug !== currentBookSlug) // Use the resolved currentBookSlug
        .map((slug) => `${slug.toLowerCase()}`);

      toRemove.forEach((base) =>
        fs
          .readdirSync(distDir)
          .filter((f) => f.toLowerCase().includes(base)) // Make comparison case-insensitive if needed
          .forEach((f) => fs.unlinkSync(path.join(distDir, f))),
      );
    },
  };
};

interface BookBuildData {
  name: string;
  short_name: string;
  description?: string;
  staticAssetSourceDir?: string;
  staticAssetDestDir?: string;
}

const bookBuildConfigs: Partial<Record<BOOK_SLUGS, BookBuildData>> = {
  [BOOK_SLUGS.PHARAON]: { name: "Faraon", short_name: "Faraon", staticAssetSourceDir: `public_books/${BOOK_SLUGS.PHARAON}`, staticAssetDestDir: BOOK_SLUGS.PHARAON },
  [BOOK_SLUGS._1984]: { name: "1984", short_name: "1984", staticAssetSourceDir: `public_books/${BOOK_SLUGS._1984}`, staticAssetDestDir: BOOK_SLUGS._1984 },
};

const activeBookConfig = bookBuildConfigs[currentBookSlug]; // Use the resolved currentBookSlug

if (!activeBookConfig) {
  throw new Error(`Build configuration for book "${currentBookSlug}" is not defined in vite.config.ts.`);
}

// Prepare targets for vite-plugin-static-copy
const staticCopyTargets: Target[] = [];
if (activeBookConfig.staticAssetSourceDir && activeBookConfig.staticAssetDestDir) {
  staticCopyTargets.push({ src: path.join(activeBookConfig.staticAssetSourceDir, "*"), dest: activeBookConfig.staticAssetDestDir });
}

export default defineConfig({
  // This define will replace all instances of __SELECTED_BOOK_SLUG__ in your client code
  // with the actual string value of currentBookSlug.
  define: {
    __SELECTED_BOOK_SLUG__: JSON.stringify(currentBookSlug), // Important: JSON.stringify to make it a string literal
  },
  optimizeDeps: { include: ["workbox-core", "workbox-precaching", "workbox-routing", "workbox-strategies", "workbox-range-requests"] },
  plugins: [
    react(),
    viteStaticCopy({ targets: staticCopyTargets }),
    VitePWA({
      srcDir: "src",
      filename: "sw.ts",
      strategies: "injectManifest",
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png,webp}"], maximumFileSizeToCacheInBytes: 30000000 },
      manifest: {
        name: activeBookConfig.name,
        short_name: activeBookConfig.short_name,
        start_url: "/",
        display: "standalone",
        background_color: "#333333",
        theme_color: "#333333",
        orientation: "landscape",
        icons: [
          { src: "public/icon-192x192.png", type: "image/png", sizes: "192x192", purpose: "any maskable" },
          { src: "public/icon-512x512.png", type: "image/png", sizes: "512x512", purpose: "any maskable" },
        ],
      },
      devOptions: { enabled: true },
    }),
    removeChunksPlugin(),
  ],
  root: "./",
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { outDir: "dist", sourcemap: true, emptyOutDir: true },
  server: { port: 5173, open: true, proxy: { "/api": "http://localhost:3000" }, watch: { ignored: ["**/src/data/*.xml"] } },
});
