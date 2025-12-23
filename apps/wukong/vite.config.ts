import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import tailwind from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: { host: "::", port: 8080 },
  plugins: [react(), mode === "development" && componentTagger(), tailwind()].filter(Boolean),
  resolve: {
    alias: {
      "@wukong": path.resolve(__dirname, "./src"),
      "@platform": path.resolve(__dirname, "../platform/src"),
      "@player": path.resolve(__dirname, "../player/src"),
      "@convex": path.resolve(__dirname, "../../convex"),
    },
  },
}));
