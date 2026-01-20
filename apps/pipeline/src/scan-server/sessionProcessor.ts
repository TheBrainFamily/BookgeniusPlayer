/**
 * sessionProcessor.ts - Real-time incremental chapter processing
 *
 * Processes chapters as they become "complete" (when next chapter marker appears)
 * or after an idle timeout. Maintains rolling context for character consistency.
 */

import fs from "fs/promises";
import path from "path";
import {
  loadAllPageResults,
  loadSessionMetadata,
  saveSessionMetadata,
  saveChapterDetectionResult,
  saveBookAnalysis,
} from "./ocrProcessor";
import { processOCRResults, type DetectedChapter } from "./chapterDetector";
import type { SessionMetadata, ChapterAnalysis, BookAnalysis, ChapterCharacter } from "./ocrSchema";
import { analyzeChapterIncremental, buildCharacterIndex } from "./chapterAnalyzerIncremental";
import { importChapterIncremental } from "../tools/importScannedBookIncremental";

const SCANNED_BOOKS_DIR = path.join(__dirname, "../../scanned-books");
const IDLE_TIMEOUT_MS = 30_000; // 30 seconds of no activity triggers processing
const CHECK_INTERVAL_MS = 5_000; // Check every 5 seconds

/**
 * Processing state persisted per session
 */
export interface ProcessingState {
  lastProcessedChapter: number; // Highest chapter number we've fully processed
  lastProcessedPageCount: number; // Page count when we last processed (to detect new pages in existing chapters)
  chapterPageCounts: Record<number, number>; // chapterNumber -> page count (to detect chapter extension)
  timeoutTriggeredChapters: number[]; // Chapters that were processed via timeout (not definitive boundary)
  rollingContext: { previousSummaries: string; previousCharacters: ChapterCharacter[] };
  processedChapterAnalyses: ChapterAnalysis[]; // Already analyzed chapters
}

/**
 * In-memory tracking of active sessions being monitored
 */
const activeSessions = new Map<
  string,
  { bookSlug: string; sessionId: string; lastActivityTime: number; isProcessing: boolean }
>();

/**
 * Load processing state from disk
 */
export async function loadProcessingState(
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
    return JSON.parse(content) as ProcessingState;
  } catch {
    return null;
  }
}

/**
 * Save processing state to disk
 */
export async function saveProcessingState(
  bookSlug: string,
  sessionId: string,
  state: ProcessingState,
): Promise<void> {
  const sessionDir = path.join(SCANNED_BOOKS_DIR, bookSlug, `session-${sessionId}`);
  await fs.mkdir(sessionDir, { recursive: true });
  const statePath = path.join(sessionDir, "processing-state.json");
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}

/**
 * Create initial processing state
 */
function createInitialState(): ProcessingState {
  return {
    lastProcessedChapter: -1,
    lastProcessedPageCount: 0,
    chapterPageCounts: {},
    timeoutTriggeredChapters: [],
    rollingContext: { previousSummaries: "", previousCharacters: [] },
    processedChapterAnalyses: [],
  };
}

/**
 * Determine which chapters are "complete" and ready to process
 *
 * A chapter is complete when:
 * 1. We see the next chapter's first page (definitive boundary)
 * 2. OR it's the last chapter and we're in timeout mode
 *
 * Re-processing rules:
 * - Chapters with definitive boundaries (next chapter exists) are NEVER re-processed
 * - Only the last chapter (timeout-triggered) can be re-processed if it grows
 */
function findCompletableChapters(
  chapters: DetectedChapter[],
  state: ProcessingState,
  isTimeoutTrigger: boolean,
): DetectedChapter[] {
  const completable: DetectedChapter[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const chapterNum = chapter.chapterNumber;
    const isLastChapter = i === chapters.length - 1;
    const hasNextChapter = i < chapters.length - 1;

    // Check if already processed
    const wasProcessed = chapterNum <= state.lastProcessedChapter;
    const wasTimeoutTriggered = state.timeoutTriggeredChapters?.includes(chapterNum) ?? false;

    if (wasProcessed) {
      // Already processed - only re-process if:
      // 1. It was previously timeout-triggered (not definitive boundary)
      // 2. AND it has grown
      // 3. AND it now has a definitive boundary OR we're in timeout mode again
      if (wasTimeoutTriggered) {
        const previousPageCount = state.chapterPageCounts[chapterNum] ?? 0;
        const currentPageCount = chapter.pages.length;
        const hasGrown = currentPageCount > previousPageCount;

        if (hasGrown && (hasNextChapter || isTimeoutTrigger)) {
          console.log(
            `[SessionProcessor] Chapter ${chapterNum} has grown from ${previousPageCount} to ${currentPageCount} pages - will re-process`,
          );
          completable.push(chapter);
        }
      }
      // If it had a definitive boundary, never re-process
      continue;
    }

    // New chapter - check if it's complete
    if (hasNextChapter) {
      // Not the last chapter - it's definitely complete (definitive boundary)
      completable.push(chapter);
    } else if (isLastChapter && isTimeoutTrigger) {
      // Last chapter + timeout - process what we have
      console.log(
        `[SessionProcessor] Processing last chapter ${chapterNum} due to timeout (may need re-processing later)`,
      );
      completable.push(chapter);
    }
    // If it's the last chapter and not timeout, we wait for more pages
  }

  return completable;
}

/**
 * Process chapters incrementally
 */
async function processChaptersIncremental(
  bookSlug: string,
  sessionId: string,
  chapters: DetectedChapter[],
  state: ProcessingState,
  isTimeoutTrigger: boolean,
): Promise<ProcessingState> {
  const completable = findCompletableChapters(chapters, state, isTimeoutTrigger);

  if (completable.length === 0) {
    console.log(`[SessionProcessor] No chapters ready to process for ${bookSlug}/${sessionId}`);
    return state;
  }

  console.log(
    `[SessionProcessor] Processing ${completable.length} chapter(s) for ${bookSlug}/${sessionId}`,
  );

  // Sort by chapter number to ensure correct order for rolling context
  completable.sort((a, b) => a.chapterNumber - b.chapterNumber);

  let { previousSummaries, previousCharacters } = state.rollingContext;
  const updatedAnalyses = [...state.processedChapterAnalyses];
  const updatedPageCounts = { ...state.chapterPageCounts };
  let highestProcessedChapter = state.lastProcessedChapter;
  // Track which chapters are timeout-triggered (last chapter with no definitive boundary)
  const updatedTimeoutTriggered = new Set(state.timeoutTriggeredChapters ?? []);

  for (const chapter of completable) {
    const chapterNum = chapter.chapterNumber;
    const isReprocess = chapterNum <= state.lastProcessedChapter;

    if (isReprocess) {
      console.log(`[SessionProcessor] Re-processing chapter ${chapterNum} with updated content`);
      // Remove old analysis for this chapter
      const oldIndex = updatedAnalyses.findIndex((a) => a.chapterNumber === chapterNum);
      if (oldIndex >= 0) {
        updatedAnalyses.splice(oldIndex, 1);
      }
      // Rebuild context from chapters before this one
      const priorAnalyses = updatedAnalyses.filter((a) => a.chapterNumber < chapterNum);
      previousSummaries = priorAnalyses
        .map((a) => `\n\n### Chapter ${a.chapterNumber}\n${a.summary}`)
        .join("");
      previousCharacters = priorAnalyses.flatMap((a) => a.characters);
    }

    try {
      console.log(`[SessionProcessor] Analyzing chapter ${chapterNum}...`);
      const analysis = await analyzeChapterIncremental(
        chapter,
        previousSummaries,
        previousCharacters,
      );

      // Update rolling context
      previousSummaries += `\n\n### Chapter ${chapterNum}\n${analysis.summary}`;
      previousCharacters = mergeCharacters(previousCharacters, analysis.characters);

      // Store analysis
      updatedAnalyses.push(analysis);
      updatedPageCounts[chapterNum] = chapter.pages.length;

      // Track whether this chapter is timeout-triggered or has definitive boundary
      const isLastCompletable = chapter === completable[completable.length - 1];
      if (isLastCompletable && isTimeoutTrigger) {
        // Last chapter processed via timeout - may need re-processing later
        updatedTimeoutTriggered.add(chapterNum);
      } else {
        // Has definitive boundary (next chapter exists) - never re-process
        updatedTimeoutTriggered.delete(chapterNum);
      }

      if (chapterNum > highestProcessedChapter) {
        highestProcessedChapter = chapterNum;
      }

      console.log(
        `[SessionProcessor] Chapter ${chapterNum} analyzed: ${analysis.characters.length} characters`,
      );

      // Import to Convex immediately
      try {
        const metadata = await loadSessionMetadata(bookSlug, sessionId);
        await importChapterIncremental({
          bookSlug,
          sessionId,
          bookTitle: metadata?.bookTitle,
          chapter,
          analysis,
          allCharacters: buildCharacterIndex(updatedAnalyses),
        });
        console.log(`[SessionProcessor] Chapter ${chapterNum} imported to Convex`);
      } catch (importError) {
        console.error(`[SessionProcessor] Failed to import chapter ${chapterNum}:`, importError);
        // Continue processing other chapters
      }
    } catch (error) {
      console.error(`[SessionProcessor] Failed to analyze chapter ${chapterNum}:`, error);
      // Continue with next chapter
    }
  }

  // Sort analyses by chapter number
  updatedAnalyses.sort((a, b) => a.chapterNumber - b.chapterNumber);

  // Build updated state
  const newState: ProcessingState = {
    lastProcessedChapter: highestProcessedChapter,
    lastProcessedPageCount: chapters.reduce((sum, c) => sum + c.pages.length, 0),
    chapterPageCounts: updatedPageCounts,
    timeoutTriggeredChapters: Array.from(updatedTimeoutTriggered),
    rollingContext: { previousSummaries, previousCharacters },
    processedChapterAnalyses: updatedAnalyses,
  };

  // Save state and analysis
  await saveProcessingState(bookSlug, sessionId, newState);

  // Save full analysis snapshot
  const allCharacters = buildCharacterIndex(updatedAnalyses);
  const bookAnalysis: BookAnalysis = { chapters: updatedAnalyses, allCharacters };
  await saveBookAnalysis(bookSlug, sessionId, bookAnalysis);

  return newState;
}

/**
 * Merge new chapter's characters into the accumulated list
 */
function mergeCharacters(
  existingCharacters: ChapterCharacter[],
  newCharacters: ChapterCharacter[],
): ChapterCharacter[] {
  const merged = [...existingCharacters];

  for (const newChar of newCharacters) {
    const existing = merged.find((c) => c.slug === newChar.slug);
    if (!existing) {
      merged.push(newChar);
    } else {
      // Update referenceCard if new one is longer/more detailed
      if (newChar.referenceCard.length > existing.referenceCard.length) {
        existing.referenceCard = newChar.referenceCard;
      }
    }
  }

  return merged;
}

/**
 * Called when OCR completes for a page - triggers incremental processing check
 */
export async function onPageOCRComplete(bookSlug: string, sessionId: string): Promise<void> {
  const key = `${bookSlug}/${sessionId}`;

  // Update activity time
  const existing = activeSessions.get(key);
  if (existing) {
    existing.lastActivityTime = Date.now();
  } else {
    activeSessions.set(key, {
      bookSlug,
      sessionId,
      lastActivityTime: Date.now(),
      isProcessing: false,
    });
  }

  // Check if we can process any chapters now
  await checkAndProcessSession(bookSlug, sessionId, false);
}

/**
 * Check a session and process any completable chapters
 */
async function checkAndProcessSession(
  bookSlug: string,
  sessionId: string,
  isTimeoutTrigger: boolean,
): Promise<void> {
  const key = `${bookSlug}/${sessionId}`;
  const session = activeSessions.get(key);

  if (!session) return;

  // Prevent concurrent processing
  if (session.isProcessing) {
    console.log(`[SessionProcessor] Session ${key} already processing, skipping`);
    return;
  }

  session.isProcessing = true;

  try {
    // Load all completed pages
    const pageResults = await loadAllPageResults(bookSlug, sessionId);
    const completedPages = pageResults.filter((p) => p.ocrStatus === "completed");

    if (completedPages.length === 0) {
      return;
    }

    // Run chapter detection on current pages
    const chapterResult = processOCRResults(completedPages);
    await saveChapterDetectionResult(bookSlug, sessionId, chapterResult);

    // Load or create processing state
    let state = await loadProcessingState(bookSlug, sessionId);
    if (!state) {
      state = createInitialState();
    }

    // Check if there are new pages since last processing
    const totalPageCount = chapterResult.allPages.length;
    if (totalPageCount === state.lastProcessedPageCount && !isTimeoutTrigger) {
      // No new pages - nothing to do
      return;
    }

    // Process completable chapters
    await processChaptersIncremental(
      bookSlug,
      sessionId,
      chapterResult.chapters,
      state,
      isTimeoutTrigger,
    );

    // Update session metadata
    const metadata = await loadSessionMetadata(bookSlug, sessionId);
    if (metadata) {
      await saveSessionMetadata(bookSlug, sessionId, {
        ...metadata,
        status: "scanning", // Keep scanning status while we're active
        totalPages: pageResults.length,
      });
    }
  } catch (error) {
    console.error(`[SessionProcessor] Error processing session ${key}:`, error);
  } finally {
    session.isProcessing = false;
  }
}

/**
 * Background timeout checker - runs periodically to trigger processing on idle sessions
 */
let timeoutCheckerInterval: NodeJS.Timeout | null = null;

async function checkIdleSessions(): Promise<void> {
  const now = Date.now();

  for (const [key, session] of activeSessions) {
    const idleTime = now - session.lastActivityTime;

    if (idleTime >= IDLE_TIMEOUT_MS && !session.isProcessing) {
      console.log(
        `[SessionProcessor] Session ${key} idle for ${Math.round(idleTime / 1000)}s, triggering processing`,
      );
      await checkAndProcessSession(session.bookSlug, session.sessionId, true);

      // After timeout processing, mark session as idle (not actively scanning)
      const metadata = await loadSessionMetadata(session.bookSlug, session.sessionId);
      if (metadata && metadata.status === "scanning") {
        await saveSessionMetadata(session.bookSlug, session.sessionId, {
          ...metadata,
          status: "idle" as SessionMetadata["status"],
        });
      }
    }
  }
}

/**
 * Start the background timeout checker
 */
export function startTimeoutChecker(): void {
  if (timeoutCheckerInterval) return;

  console.log(
    `[SessionProcessor] Starting timeout checker (${IDLE_TIMEOUT_MS / 1000}s idle threshold)`,
  );
  timeoutCheckerInterval = setInterval(checkIdleSessions, CHECK_INTERVAL_MS);
}

/**
 * Stop the background timeout checker
 */
export function stopTimeoutChecker(): void {
  if (timeoutCheckerInterval) {
    clearInterval(timeoutCheckerInterval);
    timeoutCheckerInterval = null;
    console.log("[SessionProcessor] Stopped timeout checker");
  }
}

/**
 * Register a session for monitoring (called when session starts or resumes)
 */
export function registerSession(bookSlug: string, sessionId: string): void {
  const key = `${bookSlug}/${sessionId}`;
  if (!activeSessions.has(key)) {
    activeSessions.set(key, {
      bookSlug,
      sessionId,
      lastActivityTime: Date.now(),
      isProcessing: false,
    });
    console.log(`[SessionProcessor] Registered session ${key}`);
  }
}

/**
 * Unregister a session (called when session is marked complete)
 */
export function unregisterSession(bookSlug: string, sessionId: string): void {
  const key = `${bookSlug}/${sessionId}`;
  activeSessions.delete(key);
  console.log(`[SessionProcessor] Unregistered session ${key}`);
}

/**
 * Get processing progress for a session
 */
export async function getProcessingProgress(
  bookSlug: string,
  sessionId: string,
): Promise<{
  processedChapters: number[];
  lastPageIndex: number;
  lastBookPageNumber: number;
  isProcessing: boolean;
} | null> {
  const state = await loadProcessingState(bookSlug, sessionId);
  const key = `${bookSlug}/${sessionId}`;
  const session = activeSessions.get(key);

  const pageResults = await loadAllPageResults(bookSlug, sessionId);
  const lastPageIndex =
    pageResults.length > 0 ? Math.max(...pageResults.map((p) => p.pageIndex)) : 0;

  // Find the last BOOK page number (not scan index) from OCR results
  let lastBookPageNumber = 0;
  for (const result of pageResults) {
    if (result.ocrResult) {
      const leftPage = result.ocrResult.leftPage?.pageNumber ?? 0;
      const rightPage = result.ocrResult.rightPage?.pageNumber ?? 0;
      lastBookPageNumber = Math.max(lastBookPageNumber, leftPage, rightPage);
    }
  }

  return {
    processedChapters: state?.processedChapterAnalyses.map((a) => a.chapterNumber) ?? [],
    lastPageIndex,
    lastBookPageNumber,
    isProcessing: session?.isProcessing ?? false,
  };
}
