import fs from "fs/promises";
import path from "path";
import { callGeminiWithImage } from "../callFastGemini";
import {
  OCRResultSchema,
  OCR_PROMPT,
  type PageOCRResult,
  type SessionMetadata,
  type OCRResult,
  type BookAnalysis,
} from "./ocrSchema";
import type { ChapterDetectionResult } from "./chapterDetector";

const SCANNED_BOOKS_DIR = path.join(__dirname, "../../scanned-books");

// Ensure directory exists
export async function ensureSessionDir(bookSlug: string, sessionId: string): Promise<string> {
  const sessionDir = path.join(SCANNED_BOOKS_DIR, bookSlug, `session-${sessionId}`);
  const pagesDir = path.join(sessionDir, "pages");
  await fs.mkdir(pagesDir, { recursive: true });
  return sessionDir;
}

// Save session metadata
export async function saveSessionMetadata(
  bookSlug: string,
  sessionId: string,
  metadata: SessionMetadata,
): Promise<void> {
  const sessionDir = await ensureSessionDir(bookSlug, sessionId);
  const metadataPath = path.join(sessionDir, "metadata.json");
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
}

// Load session metadata
export async function loadSessionMetadata(
  bookSlug: string,
  sessionId: string,
): Promise<SessionMetadata | null> {
  const sessionDir = path.join(SCANNED_BOOKS_DIR, bookSlug, `session-${sessionId}`);
  const metadataPath = path.join(sessionDir, "metadata.json");
  try {
    const content = await fs.readFile(metadataPath, "utf-8");
    return JSON.parse(content) as SessionMetadata;
  } catch {
    return null;
  }
}

// Save uploaded page image
export async function savePageImage(
  bookSlug: string,
  sessionId: string,
  pageIndex: number,
  imageBuffer: Buffer,
): Promise<string> {
  const sessionDir = await ensureSessionDir(bookSlug, sessionId);
  const filename = `page-${pageIndex.toString().padStart(4, "0")}.jpg`;
  const imagePath = path.join(sessionDir, "pages", filename);
  await fs.writeFile(imagePath, imageBuffer);
  return imagePath;
}

// Save OCR result for a page
export async function savePageOCRResult(
  bookSlug: string,
  sessionId: string,
  pageIndex: number,
  result: PageOCRResult,
): Promise<void> {
  const sessionDir = await ensureSessionDir(bookSlug, sessionId);
  const filename = `page-${pageIndex.toString().padStart(4, "0")}.json`;
  const resultPath = path.join(sessionDir, "pages", filename);
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
}

// Load OCR result for a page
export async function loadPageOCRResult(
  bookSlug: string,
  sessionId: string,
  pageIndex: number,
): Promise<PageOCRResult | null> {
  const sessionDir = path.join(SCANNED_BOOKS_DIR, bookSlug, `session-${sessionId}`);
  const filename = `page-${pageIndex.toString().padStart(4, "0")}.json`;
  const resultPath = path.join(sessionDir, "pages", filename);
  try {
    const content = await fs.readFile(resultPath, "utf-8");
    return JSON.parse(content) as PageOCRResult;
  } catch {
    return null;
  }
}

// Load all page OCR results for a session
export async function loadAllPageResults(
  bookSlug: string,
  sessionId: string,
): Promise<PageOCRResult[]> {
  const sessionDir = path.join(SCANNED_BOOKS_DIR, bookSlug, `session-${sessionId}`);
  const pagesDir = path.join(sessionDir, "pages");

  try {
    const files = await fs.readdir(pagesDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const results: PageOCRResult[] = [];
    for (const file of jsonFiles) {
      const content = await fs.readFile(path.join(pagesDir, file), "utf-8");
      results.push(JSON.parse(content) as PageOCRResult);
    }

    // Sort by pageIndex
    return results.sort((a, b) => a.pageIndex - b.pageIndex);
  } catch {
    return [];
  }
}

// Process OCR for a single page (async, fire-and-forget style)
export async function processPageOCR(
  bookSlug: string,
  sessionId: string,
  pageIndex: number,
): Promise<void> {
  const sessionDir = path.join(SCANNED_BOOKS_DIR, bookSlug, `session-${sessionId}`);
  const imageFilename = `page-${pageIndex.toString().padStart(4, "0")}.jpg`;
  const imagePath = path.join(sessionDir, "pages", imageFilename);

  // Create initial "processing" status
  const initialResult: PageOCRResult = {
    pageIndex,
    uploadedAt: new Date().toISOString(),
    ocrStatus: "processing",
  };
  await savePageOCRResult(bookSlug, sessionId, pageIndex, initialResult);

  try {
    // Read image and convert to base64
    const imageBuffer = await fs.readFile(imagePath);
    const imageBase64 = imageBuffer.toString("base64");

    console.log(`[OCR] Processing page ${pageIndex} for ${bookSlug}/${sessionId}`);

    // Call Gemini Vision API
    const ocrResult = await callGeminiWithImage<OCRResult>(
      OCR_PROMPT,
      imageBase64,
      "image/jpeg",
      OCRResultSchema,
    );

    const leftChapter = ocrResult.leftPage.chapterNumber;
    const rightChapter = ocrResult.rightPage.chapterNumber;
    console.log(
      `[OCR] Completed page ${pageIndex}: left p${ocrResult.leftPage.pageNumber}${leftChapter ? ` ch${leftChapter}` : ""}, right p${ocrResult.rightPage.pageNumber}${rightChapter ? ` ch${rightChapter}` : ""}`,
    );

    // Save successful result
    const successResult: PageOCRResult = {
      pageIndex,
      uploadedAt: initialResult.uploadedAt,
      ocrCompletedAt: new Date().toISOString(),
      ocrStatus: "completed",
      ocrResult,
    };
    await savePageOCRResult(bookSlug, sessionId, pageIndex, successResult);
  } catch (error) {
    console.error(`[OCR] Failed page ${pageIndex}:`, error);

    // Save failed result
    const failedResult: PageOCRResult = {
      pageIndex,
      uploadedAt: initialResult.uploadedAt,
      ocrCompletedAt: new Date().toISOString(),
      ocrStatus: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
    await savePageOCRResult(bookSlug, sessionId, pageIndex, failedResult);
  }
}

// Save chapter detection results
export async function saveChapterDetectionResult(
  bookSlug: string,
  sessionId: string,
  result: ChapterDetectionResult,
): Promise<void> {
  const sessionDir = await ensureSessionDir(bookSlug, sessionId);
  const resultPath = path.join(sessionDir, "chapters.json");

  // Convert Map to object for JSON serialization
  const serializable = {
    chapters: result.chapters,
    allPages: result.allPages,
    pageToChapterMap: Object.fromEntries(result.pageToChapterMap),
  };

  await fs.writeFile(resultPath, JSON.stringify(serializable, null, 2));
}

// Save book analysis results (summaries + characters)
export async function saveBookAnalysis(
  bookSlug: string,
  sessionId: string,
  analysis: BookAnalysis,
): Promise<void> {
  const sessionDir = await ensureSessionDir(bookSlug, sessionId);

  // Save full analysis
  const analysisPath = path.join(sessionDir, "analysis.json");
  await fs.writeFile(analysisPath, JSON.stringify(analysis, null, 2));

  // Save individual chapter analyses for debugging/incremental access
  for (const chapter of analysis.chapters) {
    const chapterPath = path.join(sessionDir, `analysis-chapter-${chapter.chapterNumber}.json`);
    await fs.writeFile(chapterPath, JSON.stringify(chapter, null, 2));
  }
}
