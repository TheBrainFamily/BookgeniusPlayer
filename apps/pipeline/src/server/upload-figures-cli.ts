#!/usr/bin/env tsx
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { convex } from "./convex-client";

dotenv.config();

function getRepoRoot(): string {
  return path.resolve(__dirname, "../../");
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  return types[ext] || "application/octet-stream";
}

function usage() {
  console.log("Usage: bun src/server/upload-figures-cli.ts <target-slug> [--source <se-slug>]");
  console.log("Examples:");
  console.log(
    "  bun src/server/upload-figures-cli.ts agatha-christie_the-mysterious-affair-at-styles",
  );
  console.log(
    "  bun src/server/upload-figures-cli.ts agatha-christie_the-mysterious-affair-at-styles-openai --source agatha-christie_the-mysterious-affair-at-styles",
  );
}

async function main() {
  const args = process.argv.slice(2);
  const targetSlug = args[0];

  if (!targetSlug) {
    usage();
    process.exit(1);
  }

  const sourceFlagIndex = args.findIndex((arg) => arg === "--source" || arg === "--from");
  const sourceSlug =
    sourceFlagIndex !== -1 && args[sourceFlagIndex + 1] ? args[sourceFlagIndex + 1] : targetSlug;

  const repoRoot = getRepoRoot();
  const seBookDir = path.join(repoRoot, "standardebooks-data", "books", sourceSlug);
  const metadataPath = path.join(seBookDir, "metadata.json");
  const imagesDir = path.join(seBookDir, "images");

  if (!fs.existsSync(metadataPath)) {
    console.error(`Standard Ebooks metadata not found: ${metadataPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(imagesDir)) {
    console.error(`Images directory not found: ${imagesDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(imagesDir).filter((f) => /\.(png|jpe?g|gif|svg|webp)$/i.test(f));

  if (files.length === 0) {
    console.log(`No figure images found in ${imagesDir}`);
    process.exit(0);
  }

  console.log(
    `Uploading ${files.length} figures from "${sourceSlug}" to books/${targetSlug}/figures...`,
  );

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(imagesDir, file);
    try {
      const content = fs.readFileSync(filePath);
      await convex.uploadFile({
        folderPath: `books/${targetSlug}/figures`,
        basename: file,
        content,
        contentType: getContentType(file),
      });
      uploaded++;
      console.log(`✔ ${file}`);
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`✖ ${file}: ${msg}`);
    }
  }

  console.log(`Done. Uploaded ${uploaded}/${files.length} figures.`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
