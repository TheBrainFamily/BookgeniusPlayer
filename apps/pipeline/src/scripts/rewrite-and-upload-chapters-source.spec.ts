import { describe, expect, test } from "vitest";
import {
  parseChapterSelection,
  shouldDeleteRewriteArtifact,
} from "./rewrite-and-upload-chapters-source";

describe("parseChapterSelection", () => {
  test("parses comma-separated chapters and ranges into sorted unique values", () => {
    expect(parseChapterSelection("3,1,2,6-8,7,8")).toEqual([1, 2, 3, 6, 7, 8]);
  });

  test("throws for invalid ranges", () => {
    expect(() => parseChapterSelection("9-2")).toThrow(/start > end/i);
    expect(() => parseChapterSelection("a-2")).toThrow(/invalid chapter range/i);
  });

  test("throws for non-positive chapter numbers", () => {
    expect(() => parseChapterSelection("0")).toThrow(/must be positive/i);
    expect(() => parseChapterSelection("-1")).toThrow(/must be positive/i);
  });
});

describe("shouldDeleteRewriteArtifact", () => {
  test("matches core rewrite artifacts for selected chapter", () => {
    const selected = new Set([5]);
    expect(shouldDeleteRewriteArtifact("rewritten-paragraphs-for-chapter-5.xml", selected)).toBe(
      true,
    );
    expect(
      shouldDeleteRewriteArtifact("rewritten-paragraphs-for-chapter-5-chunk-2.raw.xml", selected),
    ).toBe(true);
    expect(shouldDeleteRewriteArtifact("compiled-prompt-for-chapter-5-chunk-0.md", selected)).toBe(
      true,
    );
    expect(
      shouldDeleteRewriteArtifact(
        "identify-entities-for-paragraph-response-for-chapter-5-gemini.raw.txt",
        selected,
      ),
    ).toBe(true);
  });

  test("does not match unrelated files or non-selected chapters", () => {
    const selected = new Set([5]);
    expect(shouldDeleteRewriteArtifact("rewritten-paragraphs-for-chapter-4.xml", selected)).toBe(
      false,
    );
    expect(shouldDeleteRewriteArtifact("bookSettings.json", selected)).toBe(false);
    expect(shouldDeleteRewriteArtifact("prompt-summaries-with-paragraphs-5.txt", selected)).toBe(
      false,
    );
  });
});
