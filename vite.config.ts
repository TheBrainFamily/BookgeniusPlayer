import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

import { fileURLToPath } from "url";
export default defineConfig({
  optimizeDeps: { include: ["workbox-core", "workbox-precaching", "workbox-routing", "workbox-strategies", "workbox-range-requests"] },
  plugins: [
    react(),
    VitePWA({
      /* ---------- core settings ---------- */
      strategies: "injectManifest", // keep a custom sw.ts (step 3)
      srcDir: "src",
      filename: "sw.ts",

      /* ---------- what to precache on FIRST install ---------- */

      /* ---------- tell Workbox mp4s are OK (default 2 MB) ---------- */
      workbox: {
        globPatterns: ["Pharaon/*.{png,jpg,mp4,webm}", "public/Pharaon/*.mp4"],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024, // 20MB
        runtimeCaching: [{ urlPattern: ({ request }) => request.destination === "video", handler: "CacheFirst", options: { cacheName: "video-cache", rangeRequests: true } }],
      },

      /* ---------- put the rest of your static assets in runtime cache ---------- */

      /* ---------- icons / manifest ---------- */
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "Faraon",
        short_name: "Faraon",
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
      registerType: "autoUpdate",
    }),
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
  build: { outDir: "dist", sourcemap: true },
  server: {
    port: 5173, // Or any port you prefer
    open: true,
    proxy: { "/api": "http://localhost:3000" },
  },
});
