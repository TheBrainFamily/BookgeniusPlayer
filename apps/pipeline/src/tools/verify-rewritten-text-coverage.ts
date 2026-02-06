#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { convertSEBook } from "./se-converter/index";

type TextStats = { chars: number; words: number };

type ComparisonResult = {
  equal: boolean;
  ratio: number;
  left: TextStats;
  right: TextStats;
  firstMismatch?: { index: number; leftSnippet: string; rightSnippet: string };
};

const CHAPTER_FILE_REGEX = /^rewritten-paragraphs-for-chapter-(\d+)\.xml$/;
const CONTEXT_RADIUS = 120;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function getTextFromMarkup(markup: string): string {
  const dom = new JSDOM(markup);
  return normalizeWhitespace(dom.window.document.body.textContent || "");
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(" ").filter(Boolean).length;
}

function firstMismatch(left: string, right: string) {
  const max = Math.min(left.length, right.length);
  for (let i = 0; i < max; i++) {
    if (left[i] !== right[i]) {
      return i;
    }
  }
  if (left.length !== right.length) return max;
  return -1;
}

function withContext(text: string, index: number): string {
  const start = Math.max(0, index - CONTEXT_RADIUS);
  const end = Math.min(text.length, index + CONTEXT_RADIUS);
  return text.slice(start, end);
}

function compareNormalized(left: string, right: string): ComparisonResult {
  const leftWords = countWords(left);
  const rightWords = countWords(right);
  const mismatchIndex = firstMismatch(left, right);
  const equal = mismatchIndex === -1;

  return {
    equal,
    ratio: rightWords / Math.max(1, leftWords),
    left: { chars: left.length, words: leftWords },
    right: { chars: right.length, words: rightWords },
    firstMismatch: equal
      ? undefined
      : {
          index: mismatchIndex,
          leftSnippet: withContext(left, mismatchIndex),
          rightSnippet: withContext(right, mismatchIndex),
        },
  };
}

function parseChapterNumber(fileName: string): number | null {
  const match = fileName.match(CHAPTER_FILE_REGEX);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function readExpectedChapterCount(bookRoot: string): number | null {
  const settingsPath = path.join(bookRoot, "temporary-output", "bookSettings.json");
  if (!fs.existsSync(settingsPath)) return null;
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as {
      numberOfChaptersToProcess?: number;
    };
    return typeof settings.numberOfChaptersToProcess === "number"
      ? settings.numberOfChaptersToProcess
      : null;
  } catch {
    return null;
  }
}

function getRewrittenChapterFiles(bookRoot: string): Array<{ chapter: number; fileName: string }> {
  const tempDir = path.join(bookRoot, "temporary-output");
  const files = fs.readdirSync(tempDir);
  const parsed = files
    .map((fileName) => ({ chapter: parseChapterNumber(fileName), fileName }))
    .filter((f): f is { chapter: number; fileName: string } => f.chapter !== null)
    .sort((a, b) => a.chapter - b.chapter);
  return parsed;
}

function buildRewrittenMarkup(
  bookRoot: string,
  chapterFiles: Array<{ chapter: number; fileName: string }>,
) {
  const tempDir = path.join(bookRoot, "temporary-output");
  const fragments = chapterFiles.map(({ fileName }) =>
    fs.readFileSync(path.join(tempDir, fileName), "utf-8"),
  );
  return `<main><body>${fragments.join("\n")}</body></main>`;
}

function findMissingChapters(chapters: number[], expectedCount: number): number[] {
  const chapterSet = new Set(chapters);
  const missing: number[] = [];
  for (let n = 1; n <= expectedCount; n++) {
    if (!chapterSet.has(n)) missing.push(n);
  }
  return missing;
}

function printComparison(label: string, result: ComparisonResult) {
  console.log(`\n=== ${label} ===`);
  console.log(`equal: ${result.equal}`);
  console.log(
    `words: left=${result.left.words}, right=${result.right.words}, ratio=${result.ratio.toFixed(4)}`,
  );
  console.log(`chars: left=${result.left.chars}, right=${result.right.chars}`);
  if (!result.equal && result.firstMismatch) {
    console.log(`firstMismatchIndex: ${result.firstMismatch.index}`);
    console.log(`leftSnippet : ${JSON.stringify(result.firstMismatch.leftSnippet)}`);
    console.log(`rightSnippet: ${JSON.stringify(result.firstMismatch.rightSnippet)}`);
  }
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: bun src/tools/verify-rewritten-text-coverage.ts <book-slug>");
    process.exit(1);
  }

  const pipelineRoot = path.resolve(import.meta.dir, "..", "..");
  const bookRoot = path.join(pipelineRoot, "books-data", slug);
  const richXmlPath = path.join(bookRoot, "input", "rich.xml");

  if (!fs.existsSync(bookRoot)) {
    console.error(`Book not found: ${bookRoot}`);
    process.exit(1);
  }
  if (!fs.existsSync(richXmlPath)) {
    console.error(`rich.xml not found: ${richXmlPath}`);
    process.exit(1);
  }

  const rewrittenFiles = getRewrittenChapterFiles(bookRoot);
  if (rewrittenFiles.length === 0) {
    console.error(`No rewritten chapter files found in ${path.join(bookRoot, "temporary-output")}`);
    process.exit(1);
  }

  const expectedChapterCount = readExpectedChapterCount(bookRoot);
  const rewrittenChapterNumbers = rewrittenFiles.map((f) => f.chapter);
  const minChapter = rewrittenChapterNumbers[0];
  const maxChapter = rewrittenChapterNumbers[rewrittenChapterNumbers.length - 1];

  console.log(`slug: ${slug}`);
  console.log(`rewrittenChapterFiles: ${rewrittenFiles.length}`);
  console.log(`chapterRange: ${minChapter}-${maxChapter}`);
  if (expectedChapterCount !== null) {
    const missing = findMissingChapters(rewrittenChapterNumbers, expectedChapterCount);
    console.log(`expectedChapters: ${expectedChapterCount}`);
    console.log(`missingChapters: ${missing.length}`);
    if (missing.length > 0) {
      console.log(
        `missingChapterListSample: ${missing.slice(0, 20).join(", ")}${
          missing.length > 20 ? ", ..." : ""
        }`,
      );
    }
  }

  const rewrittenMarkup = buildRewrittenMarkup(bookRoot, rewrittenFiles);
  const richXml = fs.readFileSync(richXmlPath, "utf-8");

  const rewrittenText = getTextFromMarkup(rewrittenMarkup);
  const richText = getTextFromMarkup(richXml);
  const rewrittenVsRich = compareNormalized(richText, rewrittenText);
  printComparison("Rewritten vs rich.xml", rewrittenVsRich);

  let sourceComparisonFailed = false;
  try {
    const seConverted = await convertSEBook(slug);
    const sourceText = getTextFromMarkup(seConverted.textHtml);
    const rewrittenVsSource = compareNormalized(sourceText, rewrittenText);
    printComparison("Rewritten vs Standard Ebooks source", rewrittenVsSource);
  } catch (error) {
    sourceComparisonFailed = true;
    console.log("\n=== Rewritten vs Standard Ebooks source ===");
    console.log(`sourceComparisonError: ${(error as Error).message}`);
  }

  const hardFail =
    (expectedChapterCount !== null && rewrittenFiles.length < expectedChapterCount) ||
    !rewrittenVsRich.equal ||
    sourceComparisonFailed;

  if (hardFail) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
