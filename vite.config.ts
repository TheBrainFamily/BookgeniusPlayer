import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

import { fileURLToPath } from "url";

//TODO build per book
// Manifest file should be different for each book
// All these files should be imported and rexported in some central file like
// bookData.ts which should be replaced while building and inside it: (bookDataPharaon.ts, bookData1984.ts)
// metadata.ts should be replaced
// src/getCurrentBookSlug.ts
// src/data/faraon-book-xml.ts
// Example from esbuild
//       plugins: [
//   {
//     name: "alias-modules",
//     setup(build) {
//       // Redirect ./chapters import
//       build.onResolve({ filter: /^\.\/chapters$/ }, () => {
//         return { path: path.resolve("./src/chapters-pharaon.ts") };
//       });
//       // Redirect ./book import
//       build.onResolve({ filter: /^\.\/book$/ }, () => {
//         return { path: path.resolve("./src/book-pharaon.ts") };
//       });
//     },
//   },
// ],

export default defineConfig({
  optimizeDeps: { include: ["workbox-core", "workbox-precaching", "workbox-routing", "workbox-strategies", "workbox-range-requests"] },
  plugins: [
    react(),
    VitePWA({
      /*  ---- service‑worker build ---- */
      srcDir: "src",
      filename: "sw.ts", // we’ll write this next
      strategies: "injectManifest",
      injectManifest: {
        globPatterns: [
          "Pharaon/*.mp4", // <-- your videos
          "**/*.{js,css,html,svg,png,webp}",
        ],
        maximumFileSizeToCacheInBytes: 30000000,
      },

      /*  ---- manifest.json passthrough ---- */
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

      /*  ---- live‑reload while dev’ing PWAs ---- */
      devOptions: { enabled: true },
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
    watch: { ignored: ["**/src/data/*.xml"] },
  },
});
