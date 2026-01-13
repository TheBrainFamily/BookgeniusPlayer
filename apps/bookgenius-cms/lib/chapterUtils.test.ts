import { describe, it, expect } from "vitest";
import { parseChapterNumberFromBasename } from "./chapterUtils";

describe("parseChapterNumberFromBasename", () => {
  it("parses chapter number from 'chapter-N' format", () => {
    expect(parseChapterNumberFromBasename("chapter-1")).toBe(1);
    expect(parseChapterNumberFromBasename("chapter-12")).toBe(12);
    expect(parseChapterNumberFromBasename("chapter-123")).toBe(123);
  });

  it("parses chapter number from 'chapter_N' format", () => {
    expect(parseChapterNumberFromBasename("chapter_1")).toBe(1);
    expect(parseChapterNumberFromBasename("chapter_42")).toBe(42);
  });

  it("parses chapter number from 'chapter N' format (with space)", () => {
    expect(parseChapterNumberFromBasename("chapter 1")).toBe(1);
    expect(parseChapterNumberFromBasename("chapter 99")).toBe(99);
  });

  it("parses chapter number from 'chapterN' format (no separator)", () => {
    expect(parseChapterNumberFromBasename("chapter1")).toBe(1);
    expect(parseChapterNumberFromBasename("chapter15")).toBe(15);
  });

  it("is case-insensitive for 'chapter' prefix", () => {
    expect(parseChapterNumberFromBasename("Chapter-1")).toBe(1);
    expect(parseChapterNumberFromBasename("CHAPTER-5")).toBe(5);
    expect(parseChapterNumberFromBasename("ChApTeR_3")).toBe(3);
  });

  it("parses chapter number from basename starting with digits", () => {
    expect(parseChapterNumberFromBasename("1")).toBe(1);
    expect(parseChapterNumberFromBasename("42")).toBe(42);
    expect(parseChapterNumberFromBasename("007")).toBe(7);
  });

  it("parses chapter number from basename starting with digits followed by text", () => {
    expect(parseChapterNumberFromBasename("1-introduction")).toBe(1);
    expect(parseChapterNumberFromBasename("12_the_beginning")).toBe(12);
  });

  it("returns undefined for basenames without chapter numbers", () => {
    expect(parseChapterNumberFromBasename("introduction")).toBeUndefined();
    expect(parseChapterNumberFromBasename("prologue")).toBeUndefined();
    expect(parseChapterNumberFromBasename("")).toBeUndefined();
  });

  it("returns undefined for basenames with numbers not at the start or after 'chapter'", () => {
    expect(parseChapterNumberFromBasename("part2chapter")).toBeUndefined();
  });
});
