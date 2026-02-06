#!/usr/bin/env bun
/**
 * After uploading SE covers to Convex, this script:
 * 1. Queries all published files in the se-covers folder
 * 2. Extracts the intentId (R2 key prefix) from each cover URL
 * 3. Adds a `c` field to book-meta.json with the intentId
 *
 * The frontend then constructs: `${CDN_BASE}/${meta.c}/${slug}.jpg`
 */
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { getPublishedFilesInFolder } from "./convex-client";

dotenv.config({ path: path.resolve(import.meta.dir, "..", "..", ".env") });

const PIPELINE_ROOT = path.resolve(import.meta.dir, "..", "..");
const BOOK_META_PATH = path.join(PIPELINE_ROOT, "standardebooks-data", "book-meta.json");
const COVERS_FOLDER = "se-covers";

// Extract intentId from R2 URL like:
// https://odyssey-cdn.lgandecki.net/bookgenius/INTENTID/filename.jpg
function extractIntentId(url: string): string | null {
  const match = url.match(/\/bookgenius\/([^/]+)\/[^/]+$/);
  return match ? match[1] : null;
}

interface PublishedFile {
  basename: string;
  url: string;
  versionId: string;
}

type MetaEntry = { t: string; a: string; w: number; c?: string };

async function main() {
  console.log("Querying published covers from Convex...");
  const files = (await getPublishedFilesInFolder(COVERS_FOLDER)) as PublishedFile[];
  console.log(`Found ${files.length} covers in Convex\n`);

  if (files.length === 0) {
    console.log("No covers found. Run upload-se-covers.ts first.");
    process.exit(1);
  }

  // Build slug → intentId map
  const coverMap = new Map<string, string>();
  let parseErrors = 0;

  for (const file of files) {
    const slug = file.basename.replace(/\.jpg$/, "");
    const intentId = extractIntentId(file.url);
    if (intentId) {
      coverMap.set(slug, intentId);
    } else {
      parseErrors++;
      if (parseErrors <= 5) {
        console.warn(`  ⚠ Could not extract intentId for ${slug}: ${file.url}`);
      }
    }
  }

  if (parseErrors > 5) {
    console.warn(`  ... and ${parseErrors - 5} more parse errors`);
  }

  console.log(`Extracted ${coverMap.size} intentIds (${parseErrors} parse errors)\n`);

  // Sample a few URLs to verify pattern
  const sample = files.slice(0, 3);
  console.log("Sample URLs:");
  for (const f of sample) {
    console.log(`  ${f.basename}: ${f.url}`);
  }
  console.log();

  // Update book-meta.json
  const meta: Record<string, MetaEntry> = JSON.parse(fs.readFileSync(BOOK_META_PATH, "utf8"));
  let updated = 0;
  let missing = 0;

  for (const [slug, entry] of Object.entries(meta)) {
    const intentId = coverMap.get(slug);
    if (intentId) {
      entry.c = intentId;
      updated++;
    } else {
      missing++;
    }
  }

  fs.writeFileSync(BOOK_META_PATH, JSON.stringify(meta, null, 2));

  const fileSize = fs.statSync(BOOK_META_PATH).size;
  console.log(`Updated book-meta.json:`);
  console.log(`  Books with covers: ${updated}`);
  console.log(`  Books without covers: ${missing}`);
  console.log(`  File size: ${(fileSize / 1024).toFixed(1)}KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
