#!/usr/bin/env bun
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { convex } from "./convex-client";
import { getPublishedFilesInFolder } from "./convex-client";

dotenv.config({ path: path.resolve(import.meta.dir, "..", "..", ".env") });

const PIPELINE_ROOT = path.resolve(import.meta.dir, "..", "..");
const SE_BOOKS_DIR = path.join(PIPELINE_ROOT, "standardebooks-data", "books");
const BOOK_META_PATH = path.join(PIPELINE_ROOT, "standardebooks-data", "book-meta.json");
const COVERS_FOLDER = "se-covers";

function usage() {
  console.log("Usage: bun src/server/upload-se-covers.ts [options]");
  console.log();
  console.log("Options:");
  console.log("  --limit <n>     Max covers to upload");
  console.log("  --skip-existing Skip covers already in Convex (default: true)");
  console.log("  --force         Re-upload even if already exists");
  console.log("  --dry-run       Show what would be uploaded without uploading");
  console.log("  --slugs <file>  Only upload covers for slugs listed in file (one per line)");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(0);
  }

  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const slugsFileIdx = args.indexOf("--slugs");
  const slugsFile = slugsFileIdx !== -1 ? args[slugsFileIdx + 1] : null;

  // Get list of slugs to upload — defaults to queue.json (excludes plays and already-processed)
  let slugs: string[];
  if (slugsFile) {
    slugs = fs
      .readFileSync(slugsFile, "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    console.log(`Loading ${slugs.length} slugs from ${slugsFile}`);
  } else {
    const bookMeta = JSON.parse(fs.readFileSync(BOOK_META_PATH, "utf8"));
    slugs = Object.keys(bookMeta).sort();
    console.log(`Loading ${slugs.length} slugs from book-meta.json`);
  }

  // Check what's already uploaded
  let alreadyUploaded = new Set<string>();
  if (!force) {
    console.log("Checking existing covers in Convex...");
    try {
      const existing = await getPublishedFilesInFolder(COVERS_FOLDER);
      alreadyUploaded = new Set(existing.map((f) => f.basename.replace(/\.jpg$/, "")));
      console.log(`Already uploaded: ${alreadyUploaded.size} covers`);
    } catch {
      console.log("Could not check existing covers (folder may not exist yet). Uploading all.");
    }
  }

  const toUpload = slugs.filter((s) => !alreadyUploaded.has(s));
  const skipped = slugs.length - toUpload.length;
  const batch = toUpload.slice(0, limit);

  console.log(`\nSkipping: ${skipped} (already uploaded)`);
  console.log(`To upload: ${batch.length}${limit < Infinity ? ` (limited to ${limit})` : ""}`);

  if (dryRun) {
    console.log("\n--- DRY RUN ---");
    batch.slice(0, 20).forEach((s) => console.log(`  would upload: ${s}`));
    if (batch.length > 20) console.log(`  ... and ${batch.length - 20} more`);
    process.exit(0);
  }

  if (batch.length === 0) {
    console.log("Nothing to upload.");
    process.exit(0);
  }

  console.log(`\nUploading ${batch.length} covers to Convex (${COVERS_FOLDER}/)...\n`);

  let uploaded = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const slug of batch) {
    const coverPath = path.join(SE_BOOKS_DIR, slug, "images", "cover.jpg");

    if (!fs.existsSync(coverPath)) {
      console.log(`  ✖ ${slug} — cover.jpg not found`);
      failed++;
      continue;
    }

    try {
      const content = fs.readFileSync(coverPath);
      await convex.uploadFile({
        folderPath: COVERS_FOLDER,
        basename: `${slug}.jpg`,
        content,
        contentType: "image/jpeg",
      });
      uploaded++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (uploaded / (Date.now() - startTime)) * 1000 * 60;
      const remaining = batch.length - uploaded - failed;
      const eta = remaining > 0 ? Math.round(remaining / (rate / 60)) : 0;
      console.log(
        `  ✔ [${uploaded + failed}/${batch.length}] ${slug} (${(content.length / 1024).toFixed(0)}KB) — ${elapsed}s elapsed, ~${eta}s remaining`,
      );
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ✖ [${uploaded + failed}/${batch.length}] ${slug}: ${msg}`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\nDone in ${totalTime}s. Uploaded: ${uploaded}, Failed: ${failed}, Skipped: ${skipped}`,
  );

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
