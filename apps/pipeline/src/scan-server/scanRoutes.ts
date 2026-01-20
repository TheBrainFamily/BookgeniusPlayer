import { Router, type Request } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import {
  saveSessionMetadata,
  loadSessionMetadata,
  savePageImage,
  loadAllPageResults,
  processPageOCR,
  saveChapterDetectionResult,
  saveBookAnalysis,
} from "./ocrProcessor";
import type { SessionMetadata, SessionStatusResponse } from "./ocrSchema";
import { processOCRResults, summarizeChapters } from "./chapterDetector";
import { analyzeChaptersRolling, summarizeAnalysis } from "./chapterAnalyzer";
import { importScannedBook } from "../tools/importScannedBook";
import {
  registerSession,
  onPageOCRComplete,
  startTimeoutChecker,
  getProcessingProgress,
} from "./sessionProcessor";

const SCANNED_BOOKS_DIR = path.join(__dirname, "../../scanned-books");

// Start the timeout checker for incremental processing
startTimeoutChecker();

// Extend Express Request to include multer file
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const router = Router();

// Configure multer for multipart uploads (store in memory, we'll save manually)
const upload = multer({ storage: multer.memoryStorage() });

// Helper to convert title to slug
function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * POST /api/scan/start-session
 * Body: { bookSlug?: string, bookTitle: string }
 * Returns: { sessionId, bookSlug }
 */
router.post("/start-session", async (req, res) => {
  try {
    const { bookTitle, bookSlug: providedSlug } = req.body as {
      bookTitle: string;
      bookSlug?: string;
    };

    if (!bookTitle) {
      res.status(400).json({ error: "bookTitle is required" });
      return;
    }

    const bookSlug = providedSlug || toSlug(bookTitle);
    const sessionId = randomUUID();

    const now = new Date().toISOString();
    const metadata: SessionMetadata = {
      sessionId,
      bookSlug,
      bookTitle,
      startedAt: now,
      status: "scanning",
      lastActivityAt: now,
      processedChapters: [],
    };

    await saveSessionMetadata(bookSlug, sessionId, metadata);

    // Register session for incremental processing
    registerSession(bookSlug, sessionId);

    console.log(`[Scan] Started session ${sessionId} for "${bookTitle}" (${bookSlug})`);

    res.json({ sessionId, bookSlug });
  } catch (error) {
    console.error("[Scan] start-session error:", error);
    res.status(500).json({ error: "Failed to start session" });
  }
});

/**
 * POST /api/scan/upload-page
 * Multipart form: sessionId, bookSlug, pageIndex, image (file)
 * Returns: { pageIndex, ocrStatus: "processing" }
 */
router.post("/upload-page", upload.single("image"), async (req: MulterRequest, res) => {
  try {
    const {
      sessionId,
      bookSlug,
      pageIndex: pageIndexStr,
    } = req.body as { sessionId: string; bookSlug: string; pageIndex: string };

    const pageIndex = parseInt(pageIndexStr, 10);

    if (!sessionId || !bookSlug || isNaN(pageIndex)) {
      res.status(400).json({ error: "sessionId, bookSlug, and pageIndex are required" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "image file is required" });
      return;
    }

    // Save the uploaded image
    const imagePath = await savePageImage(bookSlug, sessionId, pageIndex, file.buffer);
    console.log(`[Scan] Saved page ${pageIndex} to ${imagePath}`);

    // Update session lastActivityAt
    const metadata = await loadSessionMetadata(bookSlug, sessionId);
    if (metadata) {
      await saveSessionMetadata(bookSlug, sessionId, {
        ...metadata,
        lastActivityAt: new Date().toISOString(),
      });
    }

    // Register session if not already (for resumed sessions)
    registerSession(bookSlug, sessionId);

    // Respond immediately, then process OCR in background
    res.json({ pageIndex, ocrStatus: "processing" });

    // Fire-and-forget OCR processing, then trigger incremental chapter processing
    processPageOCR(bookSlug, sessionId, pageIndex)
      .then(() => {
        // Notify session processor that a page OCR completed
        return onPageOCRComplete(bookSlug, sessionId);
      })
      .catch((err) => {
        console.error(`[Scan] Background OCR failed for page ${pageIndex}:`, err);
      });
  } catch (error) {
    console.error("[Scan] upload-page error:", error);
    res.status(500).json({ error: "Failed to upload page" });
  }
});

/**
 * GET /api/scan/session/:sessionId/status
 * Query: bookSlug
 * Returns: { sessionId, bookSlug, bookTitle, status, pages: [...] }
 */
router.get("/session/:sessionId/status", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { bookSlug } = req.query as { bookSlug: string };

    if (!bookSlug) {
      res.status(400).json({ error: "bookSlug query param is required" });
      return;
    }

    const metadata = await loadSessionMetadata(bookSlug, sessionId);
    if (!metadata) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const pageResults = await loadAllPageResults(bookSlug, sessionId);

    const response: SessionStatusResponse = {
      sessionId: metadata.sessionId,
      bookSlug: metadata.bookSlug,
      bookTitle: metadata.bookTitle,
      status: metadata.status,
      pages: pageResults.map((p) => ({
        pageIndex: p.pageIndex,
        ocrStatus: p.ocrStatus,
        leftPage: p.ocrResult?.leftPage,
        rightPage: p.ocrResult?.rightPage,
        error: p.error,
      })),
    };

    res.json(response);
  } catch (error) {
    console.error("[Scan] session status error:", error);
    res.status(500).json({ error: "Failed to get session status" });
  }
});

/**
 * GET /api/scan/book/:bookSlug/session
 * Returns the latest session for this book with processing progress
 */
router.get("/book/:bookSlug/session", async (req, res) => {
  try {
    const { bookSlug } = req.params;

    // Find all sessions for this book
    const bookDir = path.join(SCANNED_BOOKS_DIR, bookSlug);
    let sessionDirs: string[];
    try {
      const entries = await fs.readdir(bookDir);
      sessionDirs = entries.filter((e) => e.startsWith("session-"));
    } catch {
      res.status(404).json({ error: "No sessions found for this book" });
      return;
    }

    if (sessionDirs.length === 0) {
      res.status(404).json({ error: "No sessions found for this book" });
      return;
    }

    // Load all session metadata and find the most recent one
    let latestSession: SessionMetadata | null = null;
    let latestTime = 0;

    for (const dir of sessionDirs) {
      const sessionId = dir.replace("session-", "");
      const metadata = await loadSessionMetadata(bookSlug, sessionId);
      if (metadata) {
        const time = new Date(metadata.lastActivityAt || metadata.startedAt).getTime();
        if (time > latestTime) {
          latestTime = time;
          latestSession = metadata;
        }
      }
    }

    if (!latestSession) {
      res.status(404).json({ error: "No valid sessions found" });
      return;
    }

    // Get processing progress
    const progress = await getProcessingProgress(bookSlug, latestSession.sessionId);

    res.json({
      sessionId: latestSession.sessionId,
      bookSlug: latestSession.bookSlug,
      bookTitle: latestSession.bookTitle,
      status: latestSession.status,
      // Return the actual book page number, not the scan index
      lastPageIndex: progress?.lastBookPageNumber ?? 0,
      processedChapters: progress?.processedChapters ?? [],
      isProcessing: progress?.isProcessing ?? false,
    });
  } catch (error) {
    console.error("[Scan] get book session error:", error);
    res.status(500).json({ error: "Failed to get session" });
  }
});

/**
 * POST /api/scan/session/:sessionId/finish
 * Body: { bookSlug }
 * Fire-and-forget: Returns immediately, processes in background
 * @deprecated Use incremental processing instead - this is kept for backwards compatibility
 */
router.post("/session/:sessionId/finish", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { bookSlug } = req.body as { bookSlug: string };

    if (!bookSlug) {
      res.status(400).json({ error: "bookSlug is required" });
      return;
    }

    const metadata = await loadSessionMetadata(bookSlug, sessionId);
    if (!metadata) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // Update session status to processing
    const updatedMetadata: SessionMetadata = { ...metadata, status: "processing" };
    await saveSessionMetadata(bookSlug, sessionId, updatedMetadata);

    console.log(`[Scan] Session ${sessionId} marked for processing, starting background job...`);

    // Return immediately - process in background
    res.json({
      sessionId,
      bookSlug,
      status: "processing",
      message: "Processing started. Poll /status to check progress.",
    });

    // Fire-and-forget: Wait for OCR, then run chapter detection
    processSessionInBackground(bookSlug, sessionId).catch((err) => {
      console.error(`[Scan] Background processing failed for ${sessionId}:`, err);
    });
  } catch (error) {
    console.error("[Scan] finish session error:", error);
    res.status(500).json({ error: "Failed to finish session" });
  }
});

/**
 * Background processing: Wait for all OCR to complete, then run chapter detection
 */
async function processSessionInBackground(bookSlug: string, sessionId: string): Promise<void> {
  const POLL_INTERVAL_MS = 2000;
  const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes max wait
  const startTime = Date.now();

  // Wait for all OCR to complete
  while (Date.now() - startTime < MAX_WAIT_MS) {
    const pageResults = await loadAllPageResults(bookSlug, sessionId);
    const processingCount = pageResults.filter((p) => p.ocrStatus === "processing").length;

    if (processingCount === 0) {
      console.log(`[Scan] All OCR complete for session ${sessionId}, running chapter detection...`);
      break;
    }

    console.log(`[Scan] Waiting for ${processingCount} pages still processing...`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Run chapter detection
  const pageResults = await loadAllPageResults(bookSlug, sessionId);
  const completedResults = pageResults.filter((p) => p.ocrStatus === "completed");
  const failedCount = pageResults.filter((p) => p.ocrStatus === "failed").length;

  if (completedResults.length === 0) {
    console.error(`[Scan] No completed pages for session ${sessionId}`);
    const metadata = await loadSessionMetadata(bookSlug, sessionId);
    if (metadata) {
      await saveSessionMetadata(bookSlug, sessionId, { ...metadata, status: "failed" });
    }
    return;
  }

  const chapterResult = processOCRResults(completedResults);

  console.log(`[Scan] Chapter detection complete for ${sessionId}:`);
  console.log(summarizeChapters(chapterResult));

  // Save chapter detection results
  await saveChapterDetectionResult(bookSlug, sessionId, chapterResult);

  // Update status to "analyzing"
  let metadata = await loadSessionMetadata(bookSlug, sessionId);
  if (metadata) {
    await saveSessionMetadata(bookSlug, sessionId, {
      ...metadata,
      status: "processing", // Still processing - now doing analysis
    });
  }

  // Run rolling analysis (summaries + characters)
  console.log(`[Scan] Starting rolling analysis for ${sessionId}...`);
  let analysis;
  try {
    analysis = await analyzeChaptersRolling(chapterResult.chapters);
    await saveBookAnalysis(bookSlug, sessionId, analysis);

    console.log(`[Scan] Analysis complete for ${sessionId}:`);
    console.log(summarizeAnalysis(analysis));
  } catch (analysisError) {
    console.error(`[Scan] Analysis failed for ${sessionId}:`, analysisError);
    // Continue even if analysis fails - chapter detection still succeeded
  }

  // Import to Convex + generate avatars
  if (analysis) {
    console.log(`[Scan] Starting Convex import for ${sessionId}...`);
    try {
      const importResult = await importScannedBook({
        bookSlug,
        sessionId,
        title: metadata?.bookTitle,
        generateAvatars: true, // Auto-generate avatars
        chapterDetection: chapterResult,
        analysis,
      });

      console.log(
        `[Scan] Import complete for ${sessionId}: ${importResult.characterCount} characters, ${importResult.chapterCount} chapters`,
      );
    } catch (importError) {
      console.error(`[Scan] Import failed for ${sessionId}:`, importError);
      // Don't fail the whole session - analysis data is still saved locally
    }
  }

  // Update session status to completed
  metadata = await loadSessionMetadata(bookSlug, sessionId);
  if (metadata) {
    await saveSessionMetadata(bookSlug, sessionId, {
      ...metadata,
      status: "completed",
      totalPages: pageResults.length,
    });
  }

  console.log(
    `[Scan] Session ${sessionId} completed: ${completedResults.length} pages, ${chapterResult.chapters.length} chapters, ${failedCount} failed`,
  );
}

export default router;
