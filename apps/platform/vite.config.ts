import { defineConfig, type HttpProxy } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import tailwind from "@tailwindcss/vite";
import "dotenv/config";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    proxy: {
      // More specific rule must come BEFORE the general /api rule
      "^/api/questions": {
        target: "https://questions.bookgenius.net",
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/api\/questions/, ""),
        secure: true,
        configure: (proxy: HttpProxy.Server) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("x-secret-pass", process.env.ANSWERS_SECRET_PASS || "");
            proxyReq.setHeader("x-local-pass", process.env.ANSWERS_SECRET_PASS || "");
          });
        },
      },
      "/api": "http://localhost",
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), tailwind()].filter(Boolean),
  resolve: {
    alias: {
      "@platform": path.resolve(__dirname, "./src"),
      "@player": path.resolve(__dirname, "../player/src"),
      "@convex": path.resolve(__dirname, "../../convex"),
    },
  },
}));
