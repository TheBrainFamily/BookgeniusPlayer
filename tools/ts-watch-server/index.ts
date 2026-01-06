/**
 * TypeScript Watch Server (Efficient Version)
 *
 * Uses native fs.watch instead of tsgo --watch to avoid CPU polling.
 * Runs tsgo --noEmit on demand when files change.
 *
 * Usage: bun run tools/ts-watch-server/index.ts
 */

import { spawn } from "child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, watch, type FSWatcher } from "fs";
import { join, relative, dirname, extname } from "path";

const PROJECT_ROOT = process.cwd();
const PORT = parseInt(process.env.TS_WATCH_PORT || "61235", 10);
const DEBOUNCE_MS = 300;

interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  code: string;
}

interface PackageWatcher {
  name: string;
  basePath: string;
  watcher: FSWatcher;
  errors: Map<string, Diagnostic[]>;
  ready: boolean;
  checking: boolean;
  pendingCheck: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

const watchers = new Map<string, PackageWatcher>();

// Parse tsgo output line for errors
// Format 1: src/file.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
// Format 2: src/file.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.
function parseTsgoLine(
  line: string,
  basePath: string,
): { file: string; diagnostic: Diagnostic } | null {
  // Try parentheses format first: file(line,col): error TSxxxx: message
  let match = line.match(/^(.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/);

  // Fall back to colon format: file:line:col - error TSxxxx: message
  if (!match) {
    match = line.match(/^(.+):(\d+):(\d+) - error (TS\d+): (.+)$/);
  }

  if (!match) return null;

  const [, filePath, lineStr, colStr, code, message] = match;
  const absolutePath = filePath.startsWith("/") ? filePath : join(basePath, filePath);

  return {
    file: absolutePath,
    diagnostic: {
      file: absolutePath,
      line: parseInt(lineStr, 10),
      column: parseInt(colStr, 10),
      message,
      code,
    },
  };
}

// Run tsgo for a package
function runTypeCheck(watcher: PackageWatcher): void {
  if (watcher.checking) {
    watcher.pendingCheck = true;
    return;
  }

  watcher.checking = true;
  const errors = new Map<string, Diagnostic[]>();

  const proc = spawn("bunx", ["tsgo", "--noEmit", "--pretty", "false"], {
    cwd: watcher.basePath,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  });

  let output = "";

  proc.stdout?.on("data", (data: Buffer) => {
    output += data.toString();
  });

  proc.stderr?.on("data", (data: Buffer) => {
    output += data.toString();
  });

  proc.on("close", (exitCode) => {
    // Debug: log raw output
    if (output.trim()) {
      console.log(`[${watcher.name}] tsgo output (exit ${exitCode}):\n${output}`);
    }

    // Parse output
    for (const line of output.split("\n")) {
      const parsed = parseTsgoLine(line.trim(), watcher.basePath);
      if (parsed) {
        const existing = errors.get(parsed.file) || [];
        existing.push(parsed.diagnostic);
        errors.set(parsed.file, existing);
      }
    }

    watcher.errors = errors;
    watcher.ready = true;
    watcher.checking = false;

    const errorCount = Array.from(errors.values()).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`[${watcher.name}] Check complete - ${errorCount} error(s)`);

    // Run again if changes happened during check
    if (watcher.pendingCheck) {
      watcher.pendingCheck = false;
      scheduleTypeCheck(watcher);
    }
  });

  proc.on("error", (err) => {
    console.error(`[${watcher.name}] Error running tsgo:`, err.message);
    watcher.checking = false;
    watcher.ready = true;
  });
}

// Schedule a debounced type check
function scheduleTypeCheck(watcher: PackageWatcher): void {
  if (watcher.debounceTimer) {
    clearTimeout(watcher.debounceTimer);
  }

  watcher.debounceTimer = setTimeout(() => {
    watcher.debounceTimer = null;
    runTypeCheck(watcher);
  }, DEBOUNCE_MS);
}

// Find all TypeScript projects
function findTypeScriptProjects(): { name: string; path: string }[] {
  const configs: { name: string; path: string }[] = [];

  const packageDirs = [
    { name: "player", path: "apps/player" },
    { name: "cms", path: "apps/bookgenius-cms" },
    { name: "pipeline", path: "apps/pipeline" },
    { name: "platform", path: "apps/platform" },
    { name: "pipeline-ui", path: "apps/pipeline-ui" },
    { name: "ffmpeg-worker", path: "apps/ffmpeg-worker" },
    { name: "convex", path: "convex" },
  ];

  for (const pkg of packageDirs) {
    const tsconfigPath = join(PROJECT_ROOT, pkg.path, "tsconfig.json");
    if (existsSync(tsconfigPath)) {
      configs.push({ name: pkg.name, path: tsconfigPath });
    }
  }

  return configs;
}

// Start watching a package with native fs.watch
function startWatcher(name: string, tsconfigPath: string): PackageWatcher {
  const basePath = dirname(tsconfigPath);
  const srcPath = join(basePath, "src");
  const watchPath = existsSync(srcPath) ? srcPath : basePath;

  console.log(`[${name}] Watching ${relative(PROJECT_ROOT, watchPath)}/**/*.{ts,tsx}`);

  const watcher: PackageWatcher = {
    name,
    basePath,
    watcher: null as unknown as FSWatcher, // Will be set below
    errors: new Map(),
    ready: false,
    checking: false,
    pendingCheck: false,
    debounceTimer: null,
  };

  const fsWatcher = watch(watchPath, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;

    // Only watch TypeScript files
    const ext = extname(filename);
    if (ext !== ".ts" && ext !== ".tsx") return;

    // Ignore node_modules and build artifacts
    if (
      filename.includes("node_modules") ||
      filename.includes("dist") ||
      filename.includes(".next")
    ) {
      return;
    }

    console.log(`[${name}] File changed: ${filename}`);
    scheduleTypeCheck(watcher);
  });

  watcher.watcher = fsWatcher;

  // Initial type check
  runTypeCheck(watcher);

  return watcher;
}

// Get all diagnostics
function getAllDiagnostics(): {
  ready: boolean;
  errorCount: number;
  files: Record<string, Diagnostic[]>;
} {
  const files: Record<string, Diagnostic[]> = {};
  let errorCount = 0;
  let allReady = true;

  for (const watcher of watchers.values()) {
    if (!watcher.ready) allReady = false;

    for (const [file, diagnostics] of watcher.errors) {
      files[file] = diagnostics;
      errorCount += diagnostics.length;
    }
  }

  return { ready: allReady, errorCount, files };
}

// HTTP server
function createHttpServer() {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const pathname = url.pathname;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (pathname === "/health") {
      res.end(JSON.stringify({ status: "ok", project: "frontend" }));
      return;
    }

    if (pathname === "/status") {
      const status = Array.from(watchers.entries()).map(([name, w]) => ({
        name,
        ready: w.ready,
        checking: w.checking,
        errorCount: Array.from(w.errors.values()).reduce((sum, arr) => sum + arr.length, 0),
      }));
      res.end(JSON.stringify({ watchers: status }));
      return;
    }

    if (pathname === "/diagnostics") {
      const result = getAllDiagnostics();
      res.statusCode = result.errorCount > 0 ? 422 : 200;
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === "/wait") {
      const timeout = parseInt(url.searchParams.get("timeout") || "10000", 10);
      const start = Date.now();

      const check = () => {
        const allReady = Array.from(watchers.values()).every((w) => w.ready && !w.checking);

        if (allReady || Date.now() - start > timeout) {
          const result = getAllDiagnostics();
          res.statusCode = result.errorCount > 0 ? 422 : 200;
          res.end(JSON.stringify(result));
          return;
        }

        setTimeout(check, 100);
      };

      check();
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`\nHTTP server listening on http://127.0.0.1:${PORT}`);
    console.log("Endpoints:");
    console.log("  GET /health      - Health check");
    console.log("  GET /status      - Status of all watchers");
    console.log("  GET /diagnostics - Get all errors");
    console.log("  GET /wait        - Wait for checks to complete, then return errors");
    console.log("");
  });

  return server;
}

// Main
function main() {
  console.log("TypeScript Watch Server (Efficient)");
  console.log("====================================");
  console.log("Using native fs.watch (no polling)\n");

  const projects = findTypeScriptProjects();

  console.log(`Found ${projects.length} TypeScript projects:\n`);
  for (const project of projects) {
    console.log(`  - ${project.name}: ${relative(PROJECT_ROOT, project.path)}`);
  }
  console.log("");

  // Start watchers
  for (const project of projects) {
    const watcher = startWatcher(project.name, project.path);
    watchers.set(project.name, watcher);
  }

  // Start HTTP server
  createHttpServer();

  // Handle shutdown
  const cleanup = () => {
    console.log("\nShutting down...");
    for (const watcher of watchers.values()) {
      watcher.watcher.close();
      if (watcher.debounceTimer) clearTimeout(watcher.debounceTimer);
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main();
