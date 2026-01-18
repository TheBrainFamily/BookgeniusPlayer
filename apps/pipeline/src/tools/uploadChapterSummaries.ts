/**
 * Upload Chapter Summaries Only
 *
 * Uploads character chapter summaries from existing analysis.json to Convex.
 * Does NOT regenerate avatars, styles, or reparse text.
 *
 * Usage:
 *   bun run src/tools/uploadChapterSummaries.ts <book-slug> <session-id>
 *
 * Example:
 *   bun run src/tools/uploadChapterSummaries.ts right-stufd 9fa71fd6-1845-4491-8527-938494c599ed
 */

import * as fs from "fs";
import * as path from "path";
import { convex } from "../server/convex-client";
import type { BookAnalysis } from "../scan-server/ocrSchema";
import "dotenv/config";

const SCANNED_BOOKS_DIR = path.resolve(__dirname, "../../scanned-books");

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: bun run src/tools/uploadChapterSummaries.ts <book-slug> <session-id>");
    process.exit(1);
  }

  const bookSlug = args[0];
  const sessionId = args[1];
  const bookPath = `books/${bookSlug}`;

  console.log(`\n=== Upload Chapter Summaries ===`);
  console.log(`  Book: ${bookSlug}`);
  console.log(`  Session: ${sessionId}`);

  // Load analysis.json
  const analysisPath = path.join(
    SCANNED_BOOKS_DIR,
    bookSlug,
    `session-${sessionId}`,
    "analysis.json",
  );
  if (!fs.existsSync(analysisPath)) {
    console.error(`Analysis file not found: ${analysisPath}`);
    process.exit(1);
  }

  const analysis = JSON.parse(fs.readFileSync(analysisPath, "utf-8")) as BookAnalysis;
  console.log(`  Loaded analysis with ${analysis.chapters.length} chapters`);

  // Build first appearance map
  const firstAppearance: Map<string, number> = new Map();
  for (const char of analysis.allCharacters) {
    firstAppearance.set(char.slug, char.firstSeenChapter);
  }

  // Upload summaries
  let summaryCount = 0;
  for (const chapter of analysis.chapters) {
    if (chapter.chapterNumber === 0) continue; // Skip prologue

    for (const char of chapter.characters) {
      const isFirst = firstAppearance.get(char.slug) === chapter.chapterNumber;

      // ALWAYS store the chapterAction (what they do in this chapter)
      // The global bio is shown by iOS from character.globalSummary for first appearance
      const summary = char.chapterAction || char.referenceCard; // Fallback for old analysis format

      await convex.upsertCharacterChapterSummary({
        bookPath,
        characterSlug: char.slug,
        chapterNumber: chapter.chapterNumber,
        summary,
        isFirstAppearance: isFirst,
      });

      summaryCount++;
      if (summaryCount % 10 === 0) {
        console.log(`  Uploaded ${summaryCount} summaries...`);
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Uploaded ${summaryCount} character-chapter summaries`);
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
