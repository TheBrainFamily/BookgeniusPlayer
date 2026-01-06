#!/usr/bin/env bun
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

// 1. Auto-discover workspace packages
const workspaceDirs = ["apps", "convex", "packages"]; // Added 'packages' just in case
const packageMap = new Map<string, string>();

workspaceDirs.forEach((dir) => {
  if (!existsSync(dir)) return;

  // Handle single-package folders (like 'convex' in your example)
  if (dir === "convex") {
    try {
      const pkgPath = join(dir, "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      packageMap.set(pkg.name, dir);
      packageMap.set("convex", dir);
    } catch {}
    return;
  }

  // Handle directories of packages (apps/*)
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        const pkgPath = join(dir, entry.name, "package.json");
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        packageMap.set(pkg.name, join(dir, entry.name));
        packageMap.set(entry.name, join(dir, entry.name));
      } catch {}
    }
  }
});

// 2. Process stdin with proper buffering
const decoder = new TextDecoder();
let buffer = "";

for await (const chunk of Bun.stdin.stream()) {
  buffer += decoder.decode(chunk);
  const lines = buffer.split("\n");

  // Process all complete lines (everything except the last chunk)
  for (let i = 0; i < lines.length - 1; i++) {
    console.log(processLine(lines[i]));
  }

  // Keep the incomplete last line in the buffer
  buffer = lines[lines.length - 1];
}

// Flush any remaining buffer at the end
if (buffer) {
  console.log(processLine(buffer));
}

function processLine(line: string): string {
  // Regex to capture Turbo prefix: "package-name:task: "
  // Matches optional ANSI colors before, inside, or after the prefix
  const turboPrefixRegex =
    /^((?:(?:\x1b\[[0-9;]*m)*)([@a-zA-Z0-9/-]+)(?:(?:\x1b\[[0-9;]*m)*):)/;
  
  const match = line.match(turboPrefixRegex);

  if (match) {
    const pkgName = match[2]; // The clean package name
    const pkgPath = packageMap.get(pkgName);

    if (pkgPath) {
      // Regex explanation:
      // 1. (^|[\s(])           -> Start of line, whitespace, or open paren (context start)
      // 2. ((?:\x1b\[.*?m)*)   -> Optional ANSI color codes (non-greedy)
      // 3. (src\/)             -> The literal 'src/' we want to prefix
      const pathRegex = /(^|[\s(])((?:\x1b\[.*?m)*)(src\/)/g;
      
      return line.replace(pathRegex, `$1$2${pkgPath}/$3`);
    }
  }

  return line;
}
