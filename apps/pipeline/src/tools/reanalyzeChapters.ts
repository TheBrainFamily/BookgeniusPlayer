/**
 * Re-analyze Chapters Only
 *
 * Re-runs the AI chapter analysis on existing OCR data to get better
 * chapter-specific character summaries. Does NOT redo OCR or avatars.
 *
 * Usage:
 *   bun run src/tools/reanalyzeChapters.ts <book-slug> <session-id>
 *
 * Example:
 *   bun run src/tools/reanalyzeChapters.ts right-stufd 9fa71fd6-1845-4491-8527-938494c599ed
 */

import * as fs from "fs";
import * as path from "path";
import { analyzeChaptersRolling, summarizeAnalysis } from "../scan-server/chapterAnalyzer";
import type { ChapterDetectionResult } from "../scan-server/chapterDetector";
import "dotenv/config";

const SCANNED_BOOKS_DIR = path.resolve(__dirname, "../../scanned-books");

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: bun run src/tools/reanalyzeChapters.ts <book-slug> <session-id>");
    process.exit(1);
  }

  const bookSlug = args[0];
  const sessionId = args[1];
  const sessionDir = path.join(SCANNED_BOOKS_DIR, bookSlug, `session-${sessionId}`);

  console.log(`\n=== Re-analyze Chapters ===`);
  console.log(`  Book: ${bookSlug}`);
  console.log(`  Session: ${sessionId}`);

  // Load chapters.json (contains OCR text)
  const chaptersPath = path.join(sessionDir, "chapters.json");
  if (!fs.existsSync(chaptersPath)) {
    console.error(`Chapters file not found: ${chaptersPath}`);
    process.exit(1);
  }

  const chapterDetection = JSON.parse(
    fs.readFileSync(chaptersPath, "utf-8"),
  ) as ChapterDetectionResult;
  console.log(`  Loaded ${chapterDetection.chapters.length} chapters from OCR data`);

  // Backup existing analysis
  const analysisPath = path.join(sessionDir, "analysis.json");
  if (fs.existsSync(analysisPath)) {
    const backupPath = path.join(sessionDir, `analysis.backup.${Date.now()}.json`);
    fs.copyFileSync(analysisPath, backupPath);
    console.log(`  Backed up existing analysis to: ${path.basename(backupPath)}`);
  }

  // Re-run analysis with updated prompt
  console.log(`\n  Running AI analysis (this may take a minute)...`);
  const analysis = await analyzeChaptersRolling(chapterDetection.chapters);

  // Save new analysis
  fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
  console.log(`\n  Saved new analysis to: analysis.json`);

  // Show summary
  console.log(`\n${summarizeAnalysis(analysis)}`);

  console.log(`\n=== Done ===`);
  console.log(`  Now run: bun run src/tools/uploadChapterSummaries.ts ${bookSlug} ${sessionId}`);
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
