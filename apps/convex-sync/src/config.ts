/**
 * Configuration handling - CLI args, env vars, config file
 */

import { existsSync, readFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import type { Config, SyncState } from "./types";
import { INITIAL_CURSOR } from "./types";

// Load .env files (Bun does this automatically for `bun run` but not for compiled binaries)
function loadEnvFiles() {
  const envPaths = [
    ".env",
    ".env.local",
    // Also check parent directories up to 3 levels
    "../.env",
    "../.env.local",
    "../../.env",
    "../../.env.local",
    "../../../.env",
    "../../../.env.local",
  ];

  for (const envPath of envPaths) {
    const fullPath = resolve(envPath);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          let value = trimmed.slice(eqIndex + 1).trim();
          // Remove quotes if present
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          // Only set if not already set (env vars take precedence)
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  }
}

// Load env files on module load
loadEnvFiles();

/** Find project root (directory containing .env or package.json) */
function findProjectRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, ".env")) || existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const CONFIG_PATHS = [
  ".convex-sync.toml",
  join(homedir(), ".convex-sync.toml"),
  join(homedir(), ".config/convex-sync/config.toml"),
];

interface TomlConfig {
  convex_url?: string;
  admin_key?: string;
  sync_dir?: string;
  concurrency?: number;
}

/** Parse a simple TOML file (key = "value" format) */
function parseSimpleToml(content: string): TomlConfig {
  const result: TomlConfig = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^(\w+)\s*=\s*"?([^"]*)"?$/);
    if (match) {
      const [, key, value] = match;
      if (key === "convex_url") result.convex_url = value;
      if (key === "admin_key") result.admin_key = value;
      if (key === "sync_dir") result.sync_dir = value;
      if (key === "concurrency") result.concurrency = parseInt(value, 10);
    }
  }
  return result;
}

/** Load config file from standard locations */
function loadConfigFile(): TomlConfig {
  for (const path of CONFIG_PATHS) {
    if (existsSync(path)) {
      console.log(`📄 Loading config from ${path}`);
      const content = readFileSync(path, "utf-8");
      return parseSimpleToml(content);
    }
  }
  return {};
}

/** Parse CLI arguments */
function parseArgs(): Partial<Config> {
  const args = process.argv.slice(2);
  const result: Partial<Config> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === "--url" || arg === "-u") {
      result.convexUrl = next;
      i++;
    } else if (arg === "--sync-dir" || arg === "-d") {
      result.syncDir = next;
      i++;
    } else if (arg === "--concurrency" || arg === "-c") {
      result.concurrency = parseInt(next, 10);
      i++;
    } else if (arg === "--reset") {
      result.reset = true;
    } else if (arg === "--verbose" || arg === "-v") {
      result.verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return result;
}

function printHelp() {
  console.log(`
convex-sync - Real-time sync for Convex assets

USAGE:
  convex-sync [OPTIONS]

OPTIONS:
  -u, --url <URL>        Convex deployment URL (or CONVEX_URL env)
  -d, --sync-dir <PATH>  Directory to sync to (default: ~/ConvexAssets)
  -c, --concurrency <N>  Parallel downloads (default: 20)
      --reset            Force full re-sync
  -v, --verbose          Verbose logging
  -h, --help             Show this help

AUTHENTICATION:
  Set admin key via CONVEX_ADMIN_KEY env var or in config file.

CONFIG FILE:
  ~/.convex-sync.toml or .convex-sync.toml in current directory

  convex_url = "https://your-app.convex.cloud"
  admin_key = "your-admin-key"
  sync_dir = "/path/to/sync"
  concurrency = 20
`);
}

/** Load configuration from all sources */
export function loadConfig(): Config {
  const file = loadConfigFile();
  const cli = parseArgs();
  const env = {
    // Support both CONVEX_URL and NEXT_PUBLIC_CONVEX_URL
    convexUrl: process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL,
    adminKey: process.env.CONVEX_ADMIN_KEY,
    syncDir: process.env.CONVEX_SYNC_DIR,
  };

  // Priority: CLI > env > config file > defaults
  const convexUrl = cli.convexUrl || env.convexUrl || file.convex_url;
  if (!convexUrl) {
    console.error("❌ Convex URL required. Set via --url, CONVEX_URL env, or config file.");
    process.exit(1);
  }

  // Admin key from env or config file only (NEVER from CLI - security risk)
  const adminKey = env.adminKey || file.admin_key;

  // Default sync dir: project-local ConvexAssets/ if .env found, else ~/ConvexAssets
  const defaultSyncDir = findProjectRoot()
    ? join(findProjectRoot()!, "ConvexAssets")
    : join(homedir(), "ConvexAssets");

  return {
    convexUrl,
    adminKey,
    syncDir: cli.syncDir || env.syncDir || file.sync_dir || defaultSyncDir,
    concurrency: cli.concurrency || file.concurrency || 20,
    reset: cli.reset || false,
    verbose: cli.verbose || false,
  };
}

/** Get path for sync state file */
export function getStateFile(syncDir: string): string {
  return join(syncDir, ".convex-sync-state.json");
}

/** Load sync state */
export function loadState(syncDir: string): SyncState {
  const path = getStateFile(syncDir);
  if (existsSync(path)) {
    try {
      const state = JSON.parse(readFileSync(path, "utf-8")) as SyncState;
      // Migrate legacy numeric cursor to compound cursor
      if (typeof state.cursor === "number") {
        return { ...state, cursor: { createdAt: state.cursor as unknown as number, id: "" } };
      }
      return state;
    } catch {
      return { cursor: INITIAL_CURSOR };
    }
  }
  return { cursor: INITIAL_CURSOR };
}

/** Save sync state */
export function saveState(syncDir: string, state: SyncState): void {
  mkdirSync(syncDir, { recursive: true });
  const path = getStateFile(syncDir);
  Bun.write(path, JSON.stringify(state, null, 2));
}

/** Get log directory */
export function getLogDir(): string {
  const dir = join(homedir(), "Library/Logs/ConvexSync");
  mkdirSync(dir, { recursive: true });
  return dir;
}
