#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { SOURCE_BOOKS_DIR } from "../../books-generator/src/processAllBooks";

function extractSlug(rawPath?: string): string | undefined {
  if (!rawPath) return undefined;

  const normalized = rawPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) return undefined;

  const publicIdx = parts.lastIndexOf("public_books");
  if (publicIdx >= 0 && parts.length > publicIdx + 1) {
    return parts[publicIdx + 1];
  }

  const candidate = parts[parts.length - 1];
  if (candidate === "public_books") return undefined;
  return candidate;
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const bookPathArg = process.argv.slice(2)[0];
  const slug = extractSlug(bookPathArg);
  let slugForProcessing = slug;

  if (bookPathArg && !slug) {
    console.warn(`⚠️ Could not derive a book slug from "${bookPathArg}". Processing all books instead.`);
  }

  if (slug) {
    const target = path.join(SOURCE_BOOKS_DIR, slug);
    if (!fs.existsSync(target)) {
      console.warn(`⚠️ No book directory found for slug "${slug}" in ${SOURCE_BOOKS_DIR}. Processing all books instead.`);
      slugForProcessing = undefined;
    } else {
      console.log(`🔁 Processing only book slug "${slug}" from path "${bookPathArg}".`);
    }
  }

  const processArgs = ["process-all-books"];
  if (slugForProcessing) {
    processArgs.push("--", `--only=${slugForProcessing}`);
  }

  await runCommand("pnpm", processArgs);
  await runCommand("node", ["scripts/setEnv.js", "--env", "development", "vite", "dev"]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
