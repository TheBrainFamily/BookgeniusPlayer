import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      "@player": path.resolve(__dirname, "../player/src"),
      "@convex": path.resolve(__dirname, "../../convex"),
    },
  },
  server: { port: 5180 },
});
