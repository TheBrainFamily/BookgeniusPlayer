import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
const workspaces: string[] = pkg.workspaces ?? [];

function expandWorkspace(ws: string): string[] {
  if (!ws.endsWith("/*")) {
    const tsconfig = join(ws, "tsconfig.json");
    return existsSync(tsconfig) ? [tsconfig] : [];
  }
  const base = ws.slice(0, -2);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(base, d.name, "tsconfig.json"))
    .filter(existsSync);
}

const tsconfigs = workspaces.flatMap(expandWorkspace);

export default defineConfig({
  plugins: [tsconfigPaths({ projects: tsconfigs })],
  test: {
    environment: "jsdom",
    include: ["**/*.{spec,test}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
