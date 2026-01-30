import {
  spreadResultsToLogicalPages,
  detectChapters,
  processOCRResults,
  type LogicalPage,
} from "./chapterDetector";
import type { PageOCRResult } from "./ocrSchema";

import { describe, it, expect } from "vitest";

// Helper to create a minimal OCR result
function createOCRResult(
  pageIndex: number,
  left: { pageNumber: number | null; chapterNumber?: number; chapterTitle?: string; text?: string },
  right: {
    pageNumber: number | null;
    chapterNumber?: number;
    chapterTitle?: string;
    text?: string;
  },
): PageOCRResult {
  return {
    pageIndex,
    uploadedAt: new Date().toISOString(),
    ocrCompletedAt: new Date().toISOString(),
    ocrStatus: "completed",
    ocrResult: {
      leftPage: {
        pageNumber: left.pageNumber,
        chapterNumber: left.chapterNumber,
        chapterTitle: left.chapterTitle,
        text: left.text ?? `Page ${left.pageNumber} text`,
      },
      rightPage: {
        pageNumber: right.pageNumber,
        chapterNumber: right.chapterNumber,
        chapterTitle: right.chapterTitle,
        text: right.text ?? `Page ${right.pageNumber} text`,
      },
    },
  };
}

describe("chapterDetector", () => {
  describe("spreadResultsToLogicalPages", () => {
    it("converts a spread into two logical pages", () => {
      const spreads: PageOCRResult[] = [
        createOCRResult(
          0,
          { pageNumber: 1, chapterNumber: 1, chapterTitle: "Chapter One" },
          { pageNumber: 2 },
        ),
      ];

      const pages = spreadResultsToLogicalPages(spreads);

      expect(pages).toHaveLength(2);
      expect(pages[0].side).toBe("left");
      expect(pages[0].pageNumber).toBe(1);
      expect(pages[0].chapterNumber).toBe(1);
      expect(pages[1].side).toBe("right");
      expect(pages[1].pageNumber).toBe(2);
      expect(pages[1].chapterNumber).toBeUndefined();
    });
  });

  describe("detectChapters", () => {
    it("BUG: should merge consecutive pages with the same chapter number", () => {
      // This test demonstrates the current bug:
      // Pages 1-11 all have chapterNumber=1, "The Angels" but get split into separate chapters
      const pages: LogicalPage[] = [
        {
          spreadIndex: 0,
          side: "right",
          pageNumber: 1,
          validatedPageNumber: 1,
          chapterNumber: 1,
          chapterTitle: "The Angels",
          text: "Page 1",
        },
        {
          spreadIndex: 1,
          side: "left",
          pageNumber: 2,
          validatedPageNumber: 2,
          chapterNumber: 1,
          chapterTitle: "The Angels",
          text: "Page 2",
        },
        {
          spreadIndex: 1,
          side: "right",
          pageNumber: 3,
          validatedPageNumber: 3,
          chapterNumber: 1,
          chapterTitle: "The Angels",
          text: "Page 3",
        },
        // Pages 4-11 continue without chapter markers
        ...Array.from({ length: 8 }, (_, i) => ({
          spreadIndex: 2 + Math.floor(i / 2),
          side: (i % 2 === 0 ? "left" : "right") as "left" | "right",
          pageNumber: 4 + i,
          validatedPageNumber: 4 + i,
          text: `Page ${4 + i}`,
        })),
      ];

      const chapters = detectChapters(pages);

      // EXPECTED: One chapter covering pages 1-11
      // ACTUAL BUG: Three chapters (1-1, 2-2, 3-11)
      expect(chapters).toHaveLength(1);
      expect(chapters[0].chapterNumber).toBe(1);
      expect(chapters[0].title).toBe("The Angels");
      expect(chapters[0].startPageNumber).toBe(1);
      expect(chapters[0].endPageNumber).toBe(11);
      expect(chapters[0].pages).toHaveLength(11);
    });

    it("should not merge pages when chapter number changes", () => {
      const pages: LogicalPage[] = [
        {
          spreadIndex: 0,
          side: "left",
          pageNumber: 1,
          validatedPageNumber: 1,
          chapterNumber: 1,
          chapterTitle: "Chapter One",
          text: "Page 1",
        },
        { spreadIndex: 0, side: "right", pageNumber: 2, validatedPageNumber: 2, text: "Page 2" },
        {
          spreadIndex: 1,
          side: "left",
          pageNumber: 3,
          validatedPageNumber: 3,
          chapterNumber: 2,
          chapterTitle: "Chapter Two",
          text: "Page 3",
        },
        { spreadIndex: 1, side: "right", pageNumber: 4, validatedPageNumber: 4, text: "Page 4" },
      ];

      const chapters = detectChapters(pages);

      expect(chapters).toHaveLength(2);
      expect(chapters[0].chapterNumber).toBe(1);
      expect(chapters[0].startPageNumber).toBe(1);
      expect(chapters[0].endPageNumber).toBe(2);
      expect(chapters[1].chapterNumber).toBe(2);
      expect(chapters[1].startPageNumber).toBe(3);
      expect(chapters[1].endPageNumber).toBe(4);
    });

    it("BUG: should treat chapterNumber: 0 as unknown, not as actual Chapter 0", () => {
      // When OCR returns chapterNumber: 0, it likely means "unknown"
      // These pages should NOT create new Chapter 0 entries mid-book
      const pages: LogicalPage[] = [
        {
          spreadIndex: 0,
          side: "left",
          pageNumber: 1,
          validatedPageNumber: 1,
          chapterNumber: 1,
          chapterTitle: "Chapter One",
          text: "Page 1",
        },
        { spreadIndex: 0, side: "right", pageNumber: 2, validatedPageNumber: 2, text: "Page 2" },
        {
          spreadIndex: 1,
          side: "left",
          pageNumber: 3,
          validatedPageNumber: 3,
          chapterNumber: 0, // OCR couldn't determine chapter - returned 0
          text: "Page 3",
        },
        { spreadIndex: 1, side: "right", pageNumber: 4, validatedPageNumber: 4, text: "Page 4" },
        {
          spreadIndex: 2,
          side: "left",
          pageNumber: 5,
          validatedPageNumber: 5,
          chapterNumber: 2,
          chapterTitle: "Chapter Two",
          text: "Page 5",
        },
      ];

      const chapters = detectChapters(pages);

      // EXPECTED: Chapter 1 (pages 1-4), Chapter 2 (page 5)
      // The chapterNumber: 0 on page 3 should NOT create a new chapter
      expect(chapters).toHaveLength(2);
      expect(chapters[0].chapterNumber).toBe(1);
      expect(chapters[0].pages).toHaveLength(4);
      expect(chapters[1].chapterNumber).toBe(2);
    });

    it("should handle prologue (pages before first chapter marker)", () => {
      const pages: LogicalPage[] = [
        { spreadIndex: 0, side: "left", pageNumber: 1, validatedPageNumber: 1, text: "Title page" },
        { spreadIndex: 0, side: "right", pageNumber: 2, validatedPageNumber: 2, text: "Copyright" },
        {
          spreadIndex: 1,
          side: "left",
          pageNumber: 3,
          validatedPageNumber: 3,
          chapterNumber: 1,
          chapterTitle: "The Beginning",
          text: "Page 3",
        },
      ];

      const chapters = detectChapters(pages);

      expect(chapters).toHaveLength(2);
      expect(chapters[0].chapterNumber).toBe(0);
      expect(chapters[0].title).toBe("Prologue / Front Matter");
      expect(chapters[0].pages).toHaveLength(2);
      expect(chapters[1].chapterNumber).toBe(1);
    });

    it("should handle pages where same chapter number appears with different titles", () => {
      // Edge case: OCR might extract different titles for the same chapter
      // due to OCR errors or different page layouts
      const pages: LogicalPage[] = [
        {
          spreadIndex: 0,
          side: "left",
          pageNumber: 1,
          validatedPageNumber: 1,
          chapterNumber: 1,
          chapterTitle: "The Angels",
          text: "Page 1",
        },
        {
          spreadIndex: 0,
          side: "right",
          pageNumber: 2,
          validatedPageNumber: 2,
          chapterNumber: 1, // Same chapter, no title this time (common in headers)
          text: "Page 2",
        },
        {
          spreadIndex: 1,
          side: "left",
          pageNumber: 3,
          validatedPageNumber: 3,
          chapterNumber: 1,
          chapterTitle: "THE ANGELS", // Same title, different case
          text: "Page 3",
        },
      ];

      const chapters = detectChapters(pages);

      // Should merge into one chapter, keeping the first non-empty title
      expect(chapters).toHaveLength(1);
      expect(chapters[0].chapterNumber).toBe(1);
      expect(chapters[0].title).toBe("The Angels");
      expect(chapters[0].pages).toHaveLength(3);
    });
  });

  describe("processOCRResults - integration", () => {
    it("should correctly process The Right Stuff scenario", () => {
      // Simulating the actual bug scenario from the user's output
      const spreads: PageOCRResult[] = [
        // Spread 0: Title page (no chapter)
        createOCRResult(0, { pageNumber: null }, { pageNumber: null }),
        // Spread 1: Pages 1-2, Chapter 1 "The Angels" starts
        createOCRResult(
          1,
          { pageNumber: 1, chapterNumber: 1, chapterTitle: "The Angels" },
          { pageNumber: 2, chapterNumber: 1, chapterTitle: "The Angels" },
        ),
        // Spread 2: Pages 3-4, still Chapter 1
        createOCRResult(
          2,
          { pageNumber: 3, chapterNumber: 1, chapterTitle: "The Angels" },
          { pageNumber: 4 },
        ),
        // ... more pages in Chapter 1 ...
        createOCRResult(3, { pageNumber: 5 }, { pageNumber: 6 }),
        createOCRResult(4, { pageNumber: 7 }, { pageNumber: 8 }),
        createOCRResult(5, { pageNumber: 9 }, { pageNumber: 10 }),
        createOCRResult(6, { pageNumber: 11 }, { pageNumber: 12 }),
        // Pages 12-17 continue but might have chapterNumber: 1 without title
        createOCRResult(7, { pageNumber: 13 }, { pageNumber: 14 }),
        createOCRResult(8, { pageNumber: 15 }, { pageNumber: 16 }),
        createOCRResult(9, { pageNumber: 17 }, { pageNumber: 18 }),
        // Chapter 2 starts
        createOCRResult(
          10,
          { pageNumber: 19, chapterNumber: 2, chapterTitle: "The Right Stuff" },
          { pageNumber: 20 },
        ),
      ];

      const result = processOCRResults(spreads);

      // Expected: Prologue (title page), Chapter 1 (pages 1-18), Chapter 2 (pages 19-20)
      expect(result.chapters.length).toBe(3);

      const [prologue, chapter1, chapter2] = result.chapters;
      expect(prologue.chapterNumber).toBe(0);
      expect(chapter1.chapterNumber).toBe(1);
      expect(chapter1.title).toBe("The Angels");
      expect(chapter1.startPageNumber).toBe(1);
      expect(chapter2.chapterNumber).toBe(2);
      expect(chapter2.title).toBe("The Right Stuff");
    });
  });
});
