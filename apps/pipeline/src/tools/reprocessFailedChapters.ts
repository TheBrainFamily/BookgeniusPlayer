/**
 * Reprocess chapters that failed analysis (e.g., due to content filtering).
 * Usage: bun apps/pipeline/src/tools/reprocessFailedChapters.ts [bookSlug] [sessionId]
 */

import fs from "fs/promises";
import path from "path";
import type { DetectedChapter, ChapterDetectionResult } from "../scan-server/chapterDetector";
import type { ChapterAnalysis, ChapterCharacter } from "../scan-server/ocrSchema";
import {
  analyzeChapterIncremental,
  buildCharacterIndex,
} from "../scan-server/chapterAnalyzerIncremental";

const SCANNED_BOOKS_DIR = path.join(__dirname, "../../scanned-books");

interface ProcessingState {
  processedChapterAnalyses: ChapterAnalysis[];
  rollingContext: { summaries: string; characters: ChapterCharacter[] };
  lastProcessedChapter: number;
  lastProcessedPageCount: number;
  chapterPageCounts: Record<number, number>;
  timeoutTriggeredChapters: number[];
}

async function findLatestSession(bookSlug: string): Promise<string | null> {
  const bookDir = path.join(SCANNED_BOOKS_DIR, bookSlug);
  try {
    const entries = await fs.readdir(bookDir);
    const sessionDirs = entries.filter((e) => e.startsWith("session-"));
    if (sessionDirs.length === 0) return null;

    let latest = sessionDirs[0];
    let latestTime = 0;
    for (const dir of sessionDirs) {
      const stat = await fs.stat(path.join(bookDir, dir));
      if (stat.mtimeMs > latestTime) {
        latestTime = stat.mtimeMs;
        latest = dir;
      }
    }
    return latest.replace("session-", "");
  } catch {
    return null;
  }
}

async function loadChapters(bookSlug: string, sessionId: string): Promise<ChapterDetectionResult> {
  const chaptersPath = path.join(
    SCANNED_BOOKS_DIR,
    bookSlug,
    `session-${sessionId}`,
    "chapters.json",
  );
  const content = await fs.readFile(chaptersPath, "utf-8");
  const data = JSON.parse(content);
  return {
    chapters: data.chapters,
    allPages: data.allPages,
    pageToChapterMap: new Map(
      Object.entries(data.pageToChapterMap).map(([k, v]) => [Number(k), v as number]),
    ),
  };
}

async function loadProcessingState(
  bookSlug: string,
  sessionId: string,
): Promise<ProcessingState | null> {
  const statePath = path.join(
    SCANNED_BOOKS_DIR,
    bookSlug,
    `session-${sessionId}`,
    "processing-state.json",
  );
  try {
    const content = await fs.readFile(statePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function saveProcessingState(
  bookSlug: string,
  sessionId: string,
  state: ProcessingState,
): Promise<void> {
  const statePath = path.join(
    SCANNED_BOOKS_DIR,
    bookSlug,
    `session-${sessionId}`,
    "processing-state.json",
  );
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}

async function saveAnalysis(
  bookSlug: string,
  sessionId: string,
  chapters: ChapterAnalysis[],
): Promise<void> {
  const sessionDir = path.join(SCANNED_BOOKS_DIR, bookSlug, `session-${sessionId}`);
  const allCharacters = buildCharacterIndex(chapters);

  const analysis = { chapters, allCharacters };
  await fs.writeFile(path.join(sessionDir, "analysis.json"), JSON.stringify(analysis, null, 2));
}

async function main() {
  const bookSlug = process.argv[2] || "low";

  // Check for --from flag to force reprocessing from a specific chapter
  const fromFlagIndex = process.argv.indexOf("--from");
  const forceFromChapter =
    fromFlagIndex !== -1 ? parseInt(process.argv[fromFlagIndex + 1], 10) : null;

  let sessionId: string | undefined = process.argv[3];
  if (sessionId === "--from") sessionId = undefined; // Handle case where --from is in position 3

  if (!sessionId) {
    const found = await findLatestSession(bookSlug);
    if (!found) {
      console.error(`No sessions found for book: ${bookSlug}`);
      process.exit(1);
    }
    sessionId = found;
  }

  console.log(`\n📚 Reprocessing chapters for: ${bookSlug}`);
  console.log(`📁 Session: ${sessionId}`);
  if (forceFromChapter !== null) {
    console.log(`🔄 Force reprocessing from chapter ${forceFromChapter} onwards`);
  }
  console.log();

  // Load current state
  const chaptersResult = await loadChapters(bookSlug, sessionId);
  const state = await loadProcessingState(bookSlug, sessionId);

  if (!state) {
    console.error("No processing state found");
    process.exit(1);
  }

  const allChapterNums = chaptersResult.chapters.map((c) => c.chapterNumber);
  const processedChapterNums = state.processedChapterAnalyses.map((a) => a.chapterNumber);
  const missingChapters = allChapterNums.filter((n) => !processedChapterNums.includes(n));

  console.log(`All chapters: ${allChapterNums.join(", ")}`);
  console.log(`Processed: ${processedChapterNums.join(", ")}`);
  console.log(`Missing: ${missingChapters.length > 0 ? missingChapters.join(", ") : "(none)"}\n`);

  // Determine starting point for reprocessing
  let startFromChapter: number;

  if (forceFromChapter !== null && !isNaN(forceFromChapter)) {
    // Force reprocess from specified chapter
    startFromChapter = forceFromChapter;
  } else if (missingChapters.length > 0) {
    // Reprocess from lowest missing chapter
    startFromChapter = Math.min(...missingChapters);
  } else {
    console.log("✅ All chapters already processed!");
    console.log("   Use --from N to force reprocessing from chapter N onwards");
    return;
  }

  const chaptersToReprocess = allChapterNums.filter((n) => n >= startFromChapter);

  console.log(`⚠️  Reprocessing from chapter ${startFromChapter} onwards to maintain context flow`);
  console.log(`   Chapters to (re)process: ${chaptersToReprocess.join(", ")}\n`);

  // Remove stale analyses for chapters we're reprocessing
  state.processedChapterAnalyses = state.processedChapterAnalyses.filter(
    (a) => a.chapterNumber < startFromChapter,
  );

  // Reprocess chapters from the gap onwards
  for (const chapterNum of chaptersToReprocess) {
    const chapter = chaptersResult.chapters.find((c) => c.chapterNumber === chapterNum);
    if (!chapter) {
      console.log(`⚠️  Chapter ${chapterNum} not found in chapters.json, skipping`);
      continue;
    }

    console.log(`\n🔄 Processing Chapter ${chapterNum}...`);

    // Build context from previously processed chapters (in order)
    const previousAnalyses = state.processedChapterAnalyses
      .filter((a) => a.chapterNumber < chapterNum)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);

    const previousSummaries = previousAnalyses
      .map((a) => `Chapter ${a.chapterNumber}: ${a.summary}`)
      .join("\n\n");

    const previousCharacters = previousAnalyses.flatMap((a) => a.characters);

    try {
      const analysis = await analyzeChapterIncremental(
        chapter as DetectedChapter,
        previousSummaries,
        previousCharacters,
      );

      // Add to state
      state.processedChapterAnalyses.push(analysis);
      state.processedChapterAnalyses.sort((a, b) => a.chapterNumber - b.chapterNumber);

      // Update rolling context
      state.rollingContext.summaries = state.processedChapterAnalyses
        .map((a) => `Chapter ${a.chapterNumber}: ${a.summary}`)
        .join("\n\n");
      state.rollingContext.characters = state.processedChapterAnalyses.flatMap((a) => a.characters);

      // Save progress
      await saveProcessingState(bookSlug, sessionId, state);
      await saveAnalysis(bookSlug, sessionId, state.processedChapterAnalyses);

      console.log(`✅ Chapter ${chapterNum} processed successfully`);
      console.log(`   Summary: ${analysis.summary.substring(0, 100)}...`);
      console.log(`   Characters: ${analysis.characters.map((c) => c.name).join(", ")}`);
    } catch (error) {
      console.error(`❌ Failed to process Chapter ${chapterNum}:`, error);
    }
  }

  console.log("\n🎉 Done!\n");
}

main().catch(console.error);
