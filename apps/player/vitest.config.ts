import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths({ root: __dirname })],
  test: { environment: "jsdom", root: __dirname },
});
