import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy, type Target } from "vite-plugin-static-copy";

import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

import { CURRENT_BOOK, BOOK_SLUGS } from "./src/consts";

// Workaround to remove unnecessary books chunks from the build
// ToDo: Do not create them in the first place
const removeChunksPlugin = () => {
  return {
    name: "remove-specified-chunks",
    apply: "build" as const,
    closeBundle() {
      console.log(`Removing chunks for books other than the: ${CURRENT_BOOK}`);
      const distDir = path.resolve(__dirname, "dist/assets");
      const toRemove = Object.values(BOOK_SLUGS)
        .filter((slug) => slug !== CURRENT_BOOK)
        .map((slug) => `${slug.toLowerCase()}`);

      toRemove.forEach((base) =>
        fs
          .readdirSync(distDir)
          .filter((f) => f.includes(base))
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

const activeBookConfig = bookBuildConfigs[CURRENT_BOOK];

if (!activeBookConfig) {
  throw new Error(`Build configuration for book "${CURRENT_BOOK}" is not defined in vite.config.ts.`);
}

// Prepare targets for vite-plugin-static-copy
const staticCopyTargets: Target[] = [];
if (activeBookConfig.staticAssetSourceDir && activeBookConfig.staticAssetDestDir) {
  staticCopyTargets.push({ src: path.join(activeBookConfig.staticAssetSourceDir, "*"), dest: activeBookConfig.staticAssetDestDir });
}

export default defineConfig({
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
  resolve: {
    alias: {
      // Map '@/' just like in tsconfig.json paths ["./*"]
      // This assumes your tsconfig.json's baseUrl is '.' (the default)
      // or not set, meaning paths are relative to the project root.
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // The above maps '@/' to the project root directory where vite.config.ts is.
      // So an import like '@/src/helpers/...' will correctly resolve to
      // '<project_root>/src/helpers/...'
    },
  },
  root: "./", // Adjust if your source files are in a subfolder
  build: {
    outDir: "dist",
    sourcemap: true,
    emptyOutDir: true, // Clean 'dist' before each build
  },
  server: {
    port: 5173, // Or any port you prefer
    open: true,
    proxy: { "/api": "http://localhost:3000" },
    watch: { ignored: ["**/src/data/*.xml"] },
  },
});
