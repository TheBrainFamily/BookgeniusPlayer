import type { PageOCRResult } from "./ocrSchema";

// A single logical page (one side of a spread)
export interface LogicalPage {
  spreadIndex: number; // Which spread this came from (pageIndex in OCR)
  side: "left" | "right";
  pageNumber: number | null; // Printed page number
  validatedPageNumber: number; // Auto-corrected page number
  chapterNumber?: number;
  chapterTitle?: string;
  text: string;
}

// A detected chapter
export interface DetectedChapter {
  chapterNumber: number;
  title?: string;
  startPageNumber: number; // First validated page number
  endPageNumber?: number; // Last validated page number (set when next chapter starts)
  pages: LogicalPage[];
}

// Result of chapter detection
export interface ChapterDetectionResult {
  chapters: DetectedChapter[];
  allPages: LogicalPage[]; // All pages in order
  pageToChapterMap: Map<number, number>; // validatedPageNumber -> chapterNumber
}

/**
 * Convert OCR spread results into individual logical pages
 */
export function spreadResultsToLogicalPages(spreads: PageOCRResult[]): LogicalPage[] {
  const pages: LogicalPage[] = [];

  // Sort by submission order
  const sorted = [...spreads].sort((a, b) => a.pageIndex - b.pageIndex);

  for (const spread of sorted) {
    if (!spread.ocrResult) continue;

    const { leftPage, rightPage } = spread.ocrResult;

    // Add left page
    pages.push({
      spreadIndex: spread.pageIndex,
      side: "left",
      pageNumber: leftPage.pageNumber,
      validatedPageNumber: leftPage.pageNumber ?? 0, // Will be corrected later
      chapterNumber: leftPage.chapterNumber,
      chapterTitle: leftPage.chapterTitle,
      text: leftPage.text,
    });

    // Add right page
    pages.push({
      spreadIndex: spread.pageIndex,
      side: "right",
      pageNumber: rightPage.pageNumber,
      validatedPageNumber: rightPage.pageNumber ?? 0, // Will be corrected later
      chapterNumber: rightPage.chapterNumber,
      chapterTitle: rightPage.chapterTitle,
      text: rightPage.text,
    });
  }

  return pages;
}

/**
 * Validate and auto-correct page numbers based on expected sequence
 */
export function validatePageNumbers(pages: LogicalPage[]): LogicalPage[] {
  if (pages.length === 0) return pages;

  const validated = [...pages];

  // Find first page with a valid page number to anchor our sequence
  let anchorIndex = -1;
  let anchorPageNumber = -1;

  for (let i = 0; i < validated.length; i++) {
    if (validated[i].pageNumber !== null) {
      anchorIndex = i;
      anchorPageNumber = validated[i].pageNumber!;
      break;
    }
  }

  // If no anchor found, assume first page is page 1
  if (anchorIndex === -1) {
    anchorIndex = 0;
    anchorPageNumber = 1;
  }

  // Propagate forward from anchor
  for (let i = anchorIndex; i < validated.length; i++) {
    const expected = anchorPageNumber + (i - anchorIndex);
    const actual = validated[i].pageNumber;

    // If OCR'd number is close to expected (within 2), use OCR value
    // Otherwise use expected
    if (actual !== null && Math.abs(actual - expected) <= 2) {
      validated[i].validatedPageNumber = actual;
    } else {
      validated[i].validatedPageNumber = expected;
    }
  }

  // Propagate backward from anchor
  for (let i = anchorIndex - 1; i >= 0; i--) {
    const expected = anchorPageNumber - (anchorIndex - i);
    const actual = validated[i].pageNumber;

    if (actual !== null && Math.abs(actual - expected) <= 2) {
      validated[i].validatedPageNumber = actual;
    } else {
      validated[i].validatedPageNumber = expected;
    }
  }

  return validated;
}

/** Check if a chapter marker should be ignored (backward jump = likely hallucination) */
function isBackwardChapterMarker(
  chapterNum: number | undefined,
  highestSeen: number,
  isSameChapter: boolean,
): boolean {
  if (chapterNum === undefined || isSameChapter) return false;
  return chapterNum > 0 && chapterNum <= highestSeen;
}

/** Find the last page with an actual OCR page number before the given index */
function findLastRealPageNumber(pages: LogicalPage[], beforeIndex: number): number | undefined {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    if (pages[i].pageNumber !== null) {
      return pages[i].pageNumber!;
    }
  }
  // Fallback to validated number if no real OCR number found
  return pages[beforeIndex - 1]?.validatedPageNumber;
}

/**
 * Detect chapters from validated pages
 *
 * Key behaviors:
 * - Consecutive pages with the same chapterNumber are merged into one chapter
 * - chapterNumber: 0 mid-book is treated as "unknown" (continues current chapter)
 * - Only pages at the START before any chapter marker become prologue (Chapter 0)
 * - Backward chapter markers are ignored (likely OCR hallucinations)
 */
export function detectChapters(pages: LogicalPage[]): DetectedChapter[] {
  const chapters: DetectedChapter[] = [];
  let currentChapter: DetectedChapter | null = null;
  let hasSeenRealChapter = false;
  let highestChapterSeen = 0;

  for (const page of pages) {
    const chapterNum = page.chapterNumber;
    const isMarker = chapterNum !== undefined;
    const isSame =
      currentChapter !== null && isMarker && chapterNum === currentChapter.chapterNumber;
    const isUnknown = chapterNum === 0 && hasSeenRealChapter;
    const isBackward = isBackwardChapterMarker(chapterNum, highestChapterSeen, isSame);

    if (isBackward) {
      console.log(
        `[ChapterDetector] Ignoring backward chapter marker: Chapter ${chapterNum} on page ${page.validatedPageNumber} (highest seen: ${highestChapterSeen})`,
      );
    }

    if (isMarker && !isSame && !isUnknown && !isBackward) {
      // This is a NEW chapter (different number than current)
      if (currentChapter) {
        // Find the last page with a real OCR number (skip illustration pages)
        currentChapter.endPageNumber = findLastRealPageNumber(pages, pages.indexOf(page));
        chapters.push(currentChapter);
      }

      // Track that we've seen a real chapter and update highest seen
      if (chapterNum !== 0) {
        hasSeenRealChapter = true;
        highestChapterSeen = Math.max(highestChapterSeen, chapterNum);
      }

      // Start new chapter
      currentChapter = {
        chapterNumber: chapterNum,
        title: page.chapterTitle,
        startPageNumber: page.validatedPageNumber,
        pages: [page],
      };
    } else if (currentChapter) {
      // Add to current chapter (same chapter number, unknown chapter, or no marker)
      currentChapter.pages.push(page);

      // Update title if we got a better one (first non-empty title wins)
      if (page.chapterTitle && !currentChapter.title) {
        currentChapter.title = page.chapterTitle;
      }
    } else {
      // Before first chapter marker - create "Chapter 0" or prologue
      currentChapter = {
        chapterNumber: 0,
        title: "Prologue / Front Matter",
        startPageNumber: page.validatedPageNumber,
        pages: [page],
      };
    }
  }

  // Close final chapter
  if (currentChapter) {
    currentChapter.endPageNumber = pages[pages.length - 1]?.validatedPageNumber;
    chapters.push(currentChapter);
  }

  return chapters;
}

/**
 * Build a map from page number to chapter number
 */
export function buildPageToChapterMap(chapters: DetectedChapter[]): Map<number, number> {
  const map = new Map<number, number>();

  for (const chapter of chapters) {
    for (const page of chapter.pages) {
      map.set(page.validatedPageNumber, chapter.chapterNumber);
    }
  }

  return map;
}

/**
 * Convert page number to "paragraph" index within a chapter
 * This enables compatibility with the existing (chapter, paragraph) positioning system
 */
export function pageToChapterParagraph(
  pageNumber: number,
  chapters: DetectedChapter[],
): { chapter: number; paragraph: number } | null {
  for (const chapter of chapters) {
    const pageInChapter = chapter.pages.find((p) => p.validatedPageNumber === pageNumber);
    if (pageInChapter) {
      // Paragraph = index within chapter's pages
      const paragraphIndex = chapter.pages.indexOf(pageInChapter);
      return { chapter: chapter.chapterNumber, paragraph: paragraphIndex };
    }
  }
  return null;
}

/**
 * Main entry point: Process all OCR results and detect chapters
 */
export function processOCRResults(spreads: PageOCRResult[]): ChapterDetectionResult {
  // Convert spreads to individual pages
  const logicalPages = spreadResultsToLogicalPages(spreads);

  // Validate page numbers
  const validatedPages = validatePageNumbers(logicalPages);

  // Detect chapters
  const chapters = detectChapters(validatedPages);

  // Build lookup map
  const pageToChapterMap = buildPageToChapterMap(chapters);

  return { chapters, allPages: validatedPages, pageToChapterMap };
}

/**
 * Generate a summary of detected chapters for logging/debugging
 */
export function summarizeChapters(result: ChapterDetectionResult): string {
  const lines: string[] = [
    `Detected ${result.chapters.length} chapters from ${result.allPages.length} pages:`,
    "",
  ];

  for (const chapter of result.chapters) {
    const title = chapter.title ? ` - "${chapter.title}"` : "";
    const pageRange = chapter.endPageNumber
      ? `pages ${chapter.startPageNumber}-${chapter.endPageNumber}`
      : `starts at page ${chapter.startPageNumber}`;
    lines.push(
      `  Chapter ${chapter.chapterNumber}${title}: ${pageRange} (${chapter.pages.length} pages)`,
    );
  }

  return lines.join("\n");
}
