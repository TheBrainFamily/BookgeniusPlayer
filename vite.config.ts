import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
export default defineConfig({
  plugins: [react()],
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
