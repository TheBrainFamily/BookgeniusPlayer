#!/usr/bin/env bun
/**
 * Quick fix script to upload chapters to chapters-source for a book.
 * Reads from temporary-output/rewritten-paragraphs-for-chapter-N.xml
 * and uploads as chapter-N.html to chapters-source.
 *
 * Usage:
 *   bun fix-chapters-upload.ts <book-slug>
 */

import path from "path";
import fs from "fs-extra";
import { convex } from "./convex-client";
import "dotenv/config";

async function fixChaptersUpload(bookSlug: string): Promise<void> {
  const repoRoot = path.resolve(__dirname, "../../");
  const bookDir = path.join(repoRoot, "books-data", bookSlug);
  const tempOutput = path.join(bookDir, "temporary-output");
  const bookPath = `books/${bookSlug}`;

  console.log(`\n📚 Fixing chapters for: ${bookSlug}\n`);

  if (!(await fs.pathExists(tempOutput))) {
    console.error(`❌ temporary-output not found: ${tempOutput}`);
    process.exit(1);
  }

  // Find all rewritten paragraph files
  const files = await fs.readdir(tempOutput);
  const chapterFiles = files
    .filter((f) => f.match(/^rewritten-paragraphs-for-chapter-\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || "0");
      const numB = parseInt(b.match(/\d+/)?.[0] || "0");
      return numA - numB;
    });

  console.log(`Found ${chapterFiles.length} chapter files\n`);

  for (const file of chapterFiles) {
    const match = file.match(/chapter-(\d+)/);
    if (!match) continue;

    const chapterNumber = parseInt(match[1], 10);
    const filePath = path.join(tempOutput, file);
    const content = await fs.readFile(filePath, "utf-8");
    const basename = `chapter-${chapterNumber}.html`;

    console.log(`  Uploading chapter ${chapterNumber}...`);

    try {
      await convex.uploadFile({
        folderPath: `${bookPath}/chapters-source`,
        basename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/html",
      });

      await convex.updateChapterMetadata({
        bookPath,
        folderPath: `${bookPath}/chapters-source`,
        basename,
        chapterNumber,
        sourceFormat: "html",
      });

      console.log(`  ✅ Chapter ${chapterNumber} uploaded`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ❌ Chapter ${chapterNumber} failed: ${msg}`);
    }
  }

  console.log(`\n✅ Done!`);
}

const bookSlug = process.argv[2];
if (!bookSlug) {
  console.log("Usage: bun fix-chapters-upload.ts <book-slug>");
  process.exit(1);
}

fixChaptersUpload(bookSlug).catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
