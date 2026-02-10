#!/usr/bin/env bun
/**
 * Direct TypeScript typecheck hook for Claude Code
 *
 * Runs tsgo --noEmit --incremental for all packages in parallel.
 * Uses incremental cache for fast subsequent runs (~300ms total).
 *
 * Usage: Called as PostToolUse hook after Edit/Write on .ts/.tsx files
 */

import { spawn } from "child_process";
import { join, relative } from "path";
process.exit(0);
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();

interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  code: string;
}

interface PackageResult {
  name: string;
  errors: Diagnostic[];
  duration: number;
}

// All packages to check
const PACKAGES = [
  { name: "player", path: "apps/player" },
  { name: "cms", path: "apps/bookgenius-cms" },
  { name: "pipeline", path: "apps/pipeline" },
  { name: "platform", path: "apps/platform" },
  { name: "pipeline-ui", path: "apps/pipeline-ui" },
  { name: "ffmpeg-worker", path: "apps/ffmpeg-worker" },
  { name: "convex", path: "convex" },
  { name: "native", path: "native" },
];

// Parse tsgo output line
function parseTsgoLine(line: string, basePath: string): Diagnostic | null {
  // Format: src/file.ts(10,5): error TS2322: message
  const match = line.match(/^(.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
  if (!match) return null;

  const [, filePath, lineStr, colStr, code, message] = match;
  const absolutePath = filePath.startsWith("/") ? filePath : join(basePath, filePath);

  return {
    file: absolutePath,
    line: parseInt(lineStr, 10),
    column: parseInt(colStr, 10),
    message,
    code,
  };
}

// Run tsgo for a single package
async function checkPackage(name: string, pkgPath: string): Promise<PackageResult> {
  const basePath = join(PROJECT_ROOT, pkgPath);
  const start = Date.now();

  return new Promise((resolve) => {
    const proc = spawn("bunx", ["tsgo", "--noEmit", "--incremental", "--pretty", "false"], {
      cwd: basePath,
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

    proc.on("close", () => {
      const errors: Diagnostic[] = [];

      for (const line of output.split("\n")) {
        const parsed = parseTsgoLine(line.trim(), basePath);
        if (parsed) {
          errors.push(parsed);
        }
      }

      resolve({ name, errors, duration: Date.now() - start });
    });

    proc.on("error", () => {
      resolve({ name, errors: [], duration: Date.now() - start });
    });
  });
}

// Main
async function main() {
  // Read hook input from stdin
  let input = "";
  for await (const chunk of Bun.stdin.stream()) {
    input += new TextDecoder().decode(chunk);
  }

  // Parse input
  let toolName = "";
  let filePath = "";
  try {
    const parsed = JSON.parse(input);
    toolName = parsed.tool_name || "";
    filePath = parsed.tool_input?.file_path || "";
  } catch {
    // Ignore parse errors
  }

  // Only process Edit/Write on TypeScript files
  if (toolName !== "Edit" && toolName !== "Write") {
    process.exit(0);
  }

  if (!filePath.match(/\.(ts|tsx|mts|js|jsx|mjs)$/)) {
    process.exit(0);
  }

  // Run all packages in parallel
  const start = Date.now();
  const results = await Promise.all(PACKAGES.map((pkg) => checkPackage(pkg.name, pkg.path)));
  const totalDuration = Date.now() - start;

  // Collect all errors
  const allErrors: Array<Diagnostic & { package: string }> = [];
  for (const result of results) {
    for (const error of result.errors) {
      allErrors.push({ ...error, package: result.name });
    }
  }

  // If no errors, exit silently (success)
  if (allErrors.length === 0) {
    process.exit(0);
  }

  // Build error message for display
  const lines: string[] = [];
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`TypeScript Errors (${allErrors.length} total, checked in ${totalDuration}ms)`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");

  // Show first 10 errors
  for (const error of allErrors.slice(0, 10)) {
    const relPath = relative(PROJECT_ROOT, error.file);
    const shortPath = relPath.split("/").slice(-3).join("/");
    lines.push(`[${error.code}] ${shortPath}:${error.line}:${error.column}`);
    lines.push(`    ${error.message}`);
    lines.push("");
  }

  if (allErrors.length > 10) {
    lines.push(`... and ${allErrors.length - 10} more error(s)`);
    lines.push("");
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const errorMessage = lines.join("\n");

  // Output JSON for Claude Code:
  // - decision: "block" prompts Claude with the reason
  // - reason: shown to Claude
  // - systemMessage: shown to the USER in terminal
  const output = { decision: "block", reason: errorMessage, systemMessage: errorMessage };

  console.log(JSON.stringify(output));

  // Exit with code 0 so JSON is processed (exit code 2 ignores JSON)
  process.exit(0);
}

main().catch((err) => {
  console.error("Typecheck hook error:", err);
  process.exit(1);
});
