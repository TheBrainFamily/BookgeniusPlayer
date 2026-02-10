#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { setCurrentBook } from "../helpers/getCurrentBook";
import { FILE_TYPE } from "../helpers/filesHelpers";
import { readBookFile } from "../helpers/readBookFile";
import { getBookSettings } from "../helpers/getBookSettings";
import type { NewReferenceCardsResponse } from "../types";
import { uploadChaptersSource } from "./upload-chapters-source";

type Args = {
  bookSlug: string;
  chapters?: string;
  force: boolean;
  dryRunUpload: boolean;
  allowNew: boolean;
};

type ArtifactPattern = { regex: RegExp; chapterGroup: number };

const ARTIFACT_PATTERNS: ArtifactPattern[] = [
  { regex: /^rewritten-paragraphs-for-chapter-(\d+)\.xml$/, chapterGroup: 1 },
  { regex: /^rewritten-paragraphs-for-chapter-(\d+)-chunk-\d+.*\.xml$/, chapterGroup: 1 },
  { regex: /^rewritten-paragraphs-for-chapter-(\d+)-[a-z0-9-]+\.xml$/, chapterGroup: 1 },
  { regex: /^compiled-prompt-for-chapter-(\d+)-chunk-\d+\.md$/, chapterGroup: 1 },
  { regex: /^original-paragraphs-for-chapter-(\d+)-chunk-\d+\.xml$/, chapterGroup: 1 },
  { regex: /^broken-rewritten-paragraphs-for-chapter-(\d+)-chunk-\d+.*\.xml$/, chapterGroup: 1 },
  { regex: /^compiled-prompt-for-chapter-(\d+)-gemini2\.md$/, chapterGroup: 1 },
  { regex: /^original-paragraphs-for-chapter-(\d+)\.xml$/, chapterGroup: 1 },
  {
    regex: /^identify-entities-for-paragraph-response-for-chapter-(\d+)-[a-z0-9-]+\.raw\.txt$/,
    chapterGroup: 1,
  },
  { regex: /^broken-rewritten-paragraphs-for-chapter-(\d+)-[a-z0-9-]+\.xml$/, chapterGroup: 1 },
];

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const chaptersIdx = args.indexOf("--chapters");
  if (args.length < 1 || args[0].startsWith("--")) {
    console.error(
      "Usage: bun apps/pipeline/src/scripts/rewrite-and-upload-chapters-source.ts <book-slug> [--chapters <list>] [--force] [--dry-run-upload] [--allow-new]",
    );
    process.exit(1);
  }

  if (chaptersIdx !== -1) {
    const chaptersValue = args[chaptersIdx + 1];
    if (!chaptersValue || chaptersValue.startsWith("--")) {
      throw new Error("Missing value for --chapters. Example: --chapters 1,2,5-8");
    }
  }

  return {
    bookSlug: args[0],
    chapters: chaptersIdx !== -1 ? args[chaptersIdx + 1] : undefined,
    force: args.includes("--force"),
    dryRunUpload: args.includes("--dry-run-upload"),
    allowNew: args.includes("--allow-new"),
  };
}

export function parseChapterSelection(chaptersRaw: string): number[] {
  const values = chaptersRaw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error("Chapter selection is empty");
  }

  const result = new Set<number>();
  for (const value of values) {
    const rangeMatch = value.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);
      if (start <= 0 || end <= 0) {
        throw new Error(`Chapter numbers must be positive: "${value}"`);
      }
      if (start > end) {
        throw new Error(`Invalid chapter range (start > end): "${value}"`);
      }
      for (let chapter = start; chapter <= end; chapter++) {
        result.add(chapter);
      }
      continue;
    }

    if (/^-?\d+$/.test(value)) {
      const chapter = Number.parseInt(value, 10);
      if (chapter <= 0) {
        throw new Error(`Chapter numbers must be positive: "${value}"`);
      }
      result.add(chapter);
      continue;
    }

    if (value.includes("-")) {
      throw new Error(`Invalid chapter range: "${value}"`);
    }

    throw new Error(`Invalid chapter number: "${value}"`);
  }

  return [...result].sort((a, b) => a - b);
}

function getRepoRoot(): string {
  return path.resolve(__dirname, "../../");
}

function getBookRoot(repoRoot: string, slug: string): string {
  return path.join(repoRoot, "books-data", slug);
}

function setBookArg(slug: string): void {
  const bookArg = path.join("books-data", slug);
  try {
    setCurrentBook(bookArg);
  } catch {
    process.argv[2] = bookArg;
  }
}

function getBookChaptersFromSettings(): number[] {
  const settings = getBookSettings();
  return Array.from({ length: settings.numberOfChaptersToProcess }, (_, i) => {
    return settings.startFromChapter + i;
  });
}

function toChapterBasenames(chapters: number[]): string[] {
  return chapters.map((chapter) => `chapter-${chapter}.html`);
}

function getArtifactChapterNumber(fileName: string): number | null {
  for (const pattern of ARTIFACT_PATTERNS) {
    const match = fileName.match(pattern.regex);
    if (!match) {
      continue;
    }

    const chapter = Number.parseInt(match[pattern.chapterGroup], 10);
    return Number.isNaN(chapter) ? null : chapter;
  }

  return null;
}

export function shouldDeleteRewriteArtifact(fileName: string, chapterSet: Set<number>): boolean {
  const chapter = getArtifactChapterNumber(fileName);
  if (!chapter) {
    return false;
  }
  return chapterSet.has(chapter);
}

function clearRewriteArtifacts(tempOutputDir: string, chapters: number[]): string[] {
  if (!fs.existsSync(tempOutputDir)) {
    return [];
  }

  const chapterSet = new Set(chapters);
  const deletedFiles: string[] = [];

  const files = fs.readdirSync(tempOutputDir);
  for (const fileName of files) {
    if (!shouldDeleteRewriteArtifact(fileName, chapterSet)) {
      continue;
    }

    const fullPath = path.join(tempOutputDir, fileName);
    fs.unlinkSync(fullPath);
    deletedFiles.push(fileName);
  }

  return deletedFiles;
}

function loadReferenceCards(): NewReferenceCardsResponse {
  return JSON.parse(
    readBookFile("single-summary-per-person.json", FILE_TYPE.PERMANENT),
  ) as NewReferenceCardsResponse;
}

function getCharactersForChapter(referenceCards: NewReferenceCardsResponse) {
  return referenceCards.characters
    .filter((character) => character.name !== "generic-avatar")
    .map((character) => ({ name: character.name, summary: character.referenceCard }));
}

function validateRequestedChapters(requested: number[], chaptersFromSettings: number[]): void {
  if (chaptersFromSettings.length === 0) {
    throw new Error(
      "bookSettings chapter range is empty. Check startFromChapter and numberOfChaptersToProcess.",
    );
  }

  const available = new Set(chaptersFromSettings);
  const invalid = requested.filter((chapter) => !available.has(chapter));
  if (invalid.length === 0) {
    return;
  }

  const range = `${chaptersFromSettings[0]}-${chaptersFromSettings[chaptersFromSettings.length - 1]}`;
  throw new Error(`Requested chapter(s) outside configured range ${range}: ${invalid.join(", ")}`);
}

async function runRewriteForSelectedChapters(
  chapters: number[],
  referenceCards: NewReferenceCardsResponse,
) {
  const { identifyAndRewriteParagraphs } =
    await import("../tools/identifyEntityAndRewriteParagraphs");
  const charactersForChapter = getCharactersForChapter(referenceCards);
  for (const chapter of chapters) {
    console.log(`Rewriting chapter ${chapter}...`);
    await identifyAndRewriteParagraphs(chapter, charactersForChapter);
  }
}

async function main() {
  const args = parseArgs();
  const repoRoot = getRepoRoot();
  const bookRoot = getBookRoot(repoRoot, args.bookSlug);
  const tempOutputDir = path.join(bookRoot, "temporary-output");

  if (!fs.existsSync(bookRoot)) {
    throw new Error(`Book directory not found: ${bookRoot}`);
  }

  setBookArg(args.bookSlug);

  const allConfiguredChapters = getBookChaptersFromSettings();
  const selectedChapters = args.chapters
    ? parseChapterSelection(args.chapters)
    : allConfiguredChapters;

  validateRequestedChapters(selectedChapters, allConfiguredChapters);

  if (args.force) {
    const deleted = clearRewriteArtifacts(tempOutputDir, selectedChapters);
    console.log(
      `Force mode: deleted ${deleted.length} rewrite artifact(s) for chapters: ${selectedChapters.join(", ")}`,
    );
  }

  const referenceCards = loadReferenceCards();

  if (args.chapters) {
    await runRewriteForSelectedChapters(selectedChapters, referenceCards);
  } else {
    const { identifyCharactersAndRewriteParagraphs } =
      await import("../tools/identifyEntityAndRewriteParagraphs");
    console.log(
      `Rewriting configured chapter range (${allConfiguredChapters[0]}-${allConfiguredChapters[allConfiguredChapters.length - 1]})`,
    );
    await identifyCharactersAndRewriteParagraphs(referenceCards);
  }

  const uploadStats = await uploadChaptersSource({
    bookSlug: args.bookSlug,
    inputPath: tempOutputDir,
    onlyBasenames: toChapterBasenames(selectedChapters),
    dryRun: args.dryRunUpload,
    allowNew: args.allowNew,
  });

  console.log(
    `Upload finished. Uploaded: ${uploadStats.uploaded}, skipped: ${uploadStats.skipped}, missing: ${uploadStats.missing}, total: ${uploadStats.total}`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
