import { describe, test, expect } from "vitest";
import { shouldAllowDocument, type Filter } from "./filters";
import type { Document } from "../embeddingManager";

describe("shouldAllowDocument", () => {
  // Helper to create a mock document
  const createDoc = ({
    chapter,
    paragraphNumber,
  }: {
    chapter: number;
    paragraphNumber: number;
  }): Document => ({ chapter, paragraphNumber, text: `C${chapter}P${paragraphNumber}` });

  // --- Basic Cases --- //
  test("should allow document when no filter is provided", () => {
    const doc = createDoc({ chapter: 5, paragraphNumber: 10 });
    expect(shouldAllowDocument(doc, undefined)).toBe(true);
  });

  // --- Chapter Filtering Only --- //
  test("should allow document within chapter range (no paragraph filter)", () => {
    const doc = createDoc({ chapter: 5, paragraphNumber: 10 });
    const filter: Filter = { chapterFrom: 3, chapterTo: 7, bookSlug: "test" };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("my test", () => {
    const filter: Filter = {
      chapterFrom: 1,
      chapterTo: 2,
      paragraphFrom: 1,
      paragraphTo: 5,
      bookSlug: "test",
    };
    const doc = createDoc({ chapter: 1, paragraphNumber: 10 });
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should disallow document before chapterFrom (no paragraph filter)", () => {
    const doc = createDoc({ chapter: 2, paragraphNumber: 10 });
    const filter: Filter = { chapterFrom: 3, chapterTo: 7, bookSlug: "test" };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  test("should disallow document after chapterTo (no paragraph filter)", () => {
    const doc = createDoc({ chapter: 8, paragraphNumber: 10 });
    const filter: Filter = { chapterFrom: 3, chapterTo: 7, bookSlug: "test" };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  test("should allow document on chapterFrom boundary (no paragraph filter)", () => {
    const doc = createDoc({ chapter: 3, paragraphNumber: 10 });
    const filter: Filter = { chapterFrom: 3, chapterTo: 7, bookSlug: "test" };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should allow document on chapterTo boundary (no paragraph filter)", () => {
    const doc = createDoc({ chapter: 7, paragraphNumber: 10 });
    const filter: Filter = { chapterFrom: 3, chapterTo: 7, bookSlug: "test" };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  // --- Combined Chapter and Paragraph Filtering --- //
  test("should allow document fully within chapter and paragraph range", () => {
    const doc = createDoc({ chapter: 5, paragraphNumber: 10 });
    const filter: Filter = {
      chapterFrom: 3,
      paragraphFrom: 5,
      chapterTo: 7,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should allow document in intermediate chapter, regardless of paragraph numbers", () => {
    const doc = createDoc({ chapter: 4, paragraphNumber: 1 });
    const filter: Filter = {
      chapterFrom: 3,
      paragraphFrom: 5,
      chapterTo: 7,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should allow document in intermediate chapter (high paragraph), regardless of paragraph numbers", () => {
    const doc = createDoc({ chapter: 6, paragraphNumber: 20 });
    const filter: Filter = {
      chapterFrom: 3,
      paragraphFrom: 5,
      chapterTo: 7,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should disallow document before chapterFrom (combined filter)", () => {
    const doc = createDoc({ chapter: 2, paragraphNumber: 10 });
    const filter: Filter = {
      chapterFrom: 3,
      paragraphFrom: 5,
      chapterTo: 7,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  test("should disallow document after chapterTo (combined filter)", () => {
    const doc = createDoc({ chapter: 8, paragraphNumber: 10 });
    const filter: Filter = {
      chapterFrom: 3,
      paragraphFrom: 5,
      chapterTo: 7,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  test("should disallow document in chapterFrom but before paragraphFrom", () => {
    const doc = createDoc({ chapter: 3, paragraphNumber: 4 });
    const filter: Filter = {
      chapterFrom: 3,
      paragraphFrom: 5,
      chapterTo: 7,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  test("should allow document in chapterFrom at paragraphFrom boundary", () => {
    const doc = createDoc({ chapter: 3, paragraphNumber: 5 });
    const filter: Filter = {
      chapterFrom: 3,
      paragraphFrom: 5,
      chapterTo: 7,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should allow document in chapterFrom after paragraphFrom boundary", () => {
    const doc = createDoc({ chapter: 3, paragraphNumber: 6 });
    const filter: Filter = {
      chapterFrom: 3,
      paragraphFrom: 5,
      chapterTo: 7,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should disallow document in chapterTo but after paragraphTo", () => {
    const doc = createDoc({ chapter: 7, paragraphNumber: 16 });
    const filter: Filter = {
      chapterFrom: 3,
      paragraphFrom: 5,
      chapterTo: 7,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  test("should allow document in chapterTo at paragraphTo boundary", () => {
    const doc = createDoc({ chapter: 7, paragraphNumber: 15 });
    const filter: Filter = {
      chapterFrom: 3,
      paragraphFrom: 5,
      chapterTo: 7,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should allow document in chapterTo before paragraphTo boundary", () => {
    const doc = createDoc({ chapter: 7, paragraphNumber: 14 });
    const filter: Filter = {
      chapterFrom: 3,
      paragraphFrom: 5,
      chapterTo: 7,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  // --- Single Chapter Filtering --- //
  test("should allow document within single chapter and paragraph range", () => {
    const doc = createDoc({ chapter: 5, paragraphNumber: 10 });
    const filter: Filter = {
      chapterFrom: 5,
      paragraphFrom: 5,
      chapterTo: 5,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should disallow document before paragraphFrom in single chapter", () => {
    const doc = createDoc({ chapter: 5, paragraphNumber: 4 });
    const filter: Filter = {
      chapterFrom: 5,
      paragraphFrom: 5,
      chapterTo: 5,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  test("should disallow document after paragraphTo in single chapter", () => {
    const doc = createDoc({ chapter: 5, paragraphNumber: 16 });
    const filter: Filter = {
      chapterFrom: 5,
      paragraphFrom: 5,
      chapterTo: 5,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  test("should disallow document in different chapter (single chapter filter)", () => {
    const doc = createDoc({ chapter: 6, paragraphNumber: 10 });
    const filter: Filter = {
      chapterFrom: 5,
      paragraphFrom: 5,
      chapterTo: 5,
      paragraphTo: 15,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  // --- Partial Filters --- //
  test("should allow document when only chapterFrom is set and doc is after", () => {
    const doc = createDoc({ chapter: 5, paragraphNumber: 10 });
    const filter: Filter = { chapterFrom: 3, chapterTo: Infinity, bookSlug: "test" };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should disallow document when only chapterFrom is set and doc is before", () => {
    const doc = createDoc({ chapter: 2, paragraphNumber: 10 });
    const filter: Filter = { chapterFrom: 3, chapterTo: Infinity, bookSlug: "test" };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  test("should allow document when only chapterTo is set and doc is before", () => {
    const doc = createDoc({ chapter: 5, paragraphNumber: 10 });
    const filter: Filter = { chapterTo: 7, bookSlug: "test" };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should disallow document when only chapterTo is set and doc is after", () => {
    const doc = createDoc({ chapter: 8, paragraphNumber: 10 });
    const filter: Filter = { chapterTo: 7, bookSlug: "test" };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  test("should allow document when only chapterFrom and paragraphFrom are set (doc chapter > chapterFrom)", () => {
    const doc = createDoc({ chapter: 6, paragraphNumber: 2 });
    const filter: Filter = {
      chapterFrom: 5,
      paragraphFrom: 5,
      chapterTo: Infinity,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should allow document when only chapterFrom and paragraphFrom are set (doc chapter = chapterFrom, doc para >= paragraphFrom)", () => {
    const doc = createDoc({ chapter: 5, paragraphNumber: 6 });
    const filter: Filter = {
      chapterFrom: 5,
      paragraphFrom: 5,
      chapterTo: Infinity,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should disallow document when only chapterFrom and paragraphFrom are set (doc chapter = chapterFrom, doc para < paragraphFrom)", () => {
    const doc = createDoc({ chapter: 5, paragraphNumber: 4 });
    const filter: Filter = {
      chapterFrom: 5,
      paragraphFrom: 5,
      chapterTo: Infinity,
      bookSlug: "test",
    };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  test("should allow document when only chapterTo and paragraphTo are set (doc chapter < chapterTo)", () => {
    const doc = createDoc({ chapter: 6, paragraphNumber: 20 });
    const filter: Filter = { chapterTo: 7, paragraphTo: 15, bookSlug: "test" };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should allow document when only chapterTo and paragraphTo are set (doc chapter = chapterTo, doc para <= paragraphTo)", () => {
    const doc = createDoc({ chapter: 7, paragraphNumber: 14 });
    const filter: Filter = { chapterTo: 7, paragraphTo: 15, bookSlug: "test" };
    expect(shouldAllowDocument(doc, filter)).toBe(true);
  });

  test("should disallow document when only chapterTo and paragraphTo are set (doc chapter = chapterTo, doc para > paragraphTo)", () => {
    const doc = createDoc({ chapter: 7, paragraphNumber: 16 });
    const filter: Filter = { chapterTo: 7, paragraphTo: 15, bookSlug: "test" };
    expect(shouldAllowDocument(doc, filter)).toBe(false);
  });

  // --- Example from user query --- //
  test("should handle user query example: filter up to chapter 15, paragraph 10", () => {
    const filter: Filter = { chapterTo: 15, paragraphTo: 10, bookSlug: "test" };

    // Should allow document in chapter 14 (intermediate chapter)
    const docInIntermediateChapter = createDoc({ chapter: 14, paragraphNumber: 100 }); // High paragraph number
    expect(shouldAllowDocument(docInIntermediateChapter, filter)).toBe(true);

    // Should allow document in chapter 15, paragraph 5 (within paragraph limit)
    const docInBoundaryChapterBelowLimit = createDoc({ chapter: 15, paragraphNumber: 5 });
    expect(shouldAllowDocument(docInBoundaryChapterBelowLimit, filter)).toBe(true);

    // Should allow document in chapter 15, paragraph 10 (at paragraph limit)
    const docInBoundaryChapterAtLimit = createDoc({ chapter: 15, paragraphNumber: 10 });
    expect(shouldAllowDocument(docInBoundaryChapterAtLimit, filter)).toBe(true);

    // Should disallow document in chapter 15, paragraph 11 (above paragraph limit)
    const docInBoundaryChapterAboveLimit = createDoc({ chapter: 15, paragraphNumber: 11 });
    expect(shouldAllowDocument(docInBoundaryChapterAboveLimit, filter)).toBe(false);

    // Should disallow document in chapter 16 (above chapter limit)
    const docAfterBoundaryChapter = createDoc({ chapter: 16, paragraphNumber: 5 });
    expect(shouldAllowDocument(docAfterBoundaryChapter, filter)).toBe(false);
  });

  test("works with undefined", () => {
    const doc = createDoc({ chapter: 1, paragraphNumber: 1 });
    const filter = undefined;
    const result = shouldAllowDocument(doc, filter);
    expect(result).toBe(true);
  });
});

// Original failing test
test("filterLogic", () => {
  const doc = { chapter: 1, paragraphNumber: 1, text: "test" };
  const filter = {
    paragraphFrom: 2,
    chapterFrom: 2,
    chapterTo: 3,
    paragraphTo: 3,
    bookSlug: "test",
  };
  const result = shouldAllowDocument(doc, filter);
  expect(result).toBe(false);
});

test("BUG: chapterFrom=0 chapterTo=2 paragraphTo=7 should disallow chapter=2 paragraph=43", () => {
  const doc = { chapter: 2, paragraphNumber: 43, text: "should be filtered" };
  const filter: Filter = { chapterFrom: 0, chapterTo: 2, paragraphTo: 7, bookSlug: "test" };
  expect(shouldAllowDocument(doc, filter)).toBe(false);
});
