import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { resolveBookDir } from "../helpers/resolveBookDir";
import { getBookData } from "../shared-books-data/getBooksData";
import {
  getParagraphsFromChapterWithText,
  getSectionAttributes,
} from "./getParagraphsFromChapterWithText";

type ChapterParagraph = ReturnType<typeof getParagraphsFromChapterWithText>[number];
type CachedCheerio = {
  richXmlPath: string;
  mtimeMs: number;
  bookText: string;
  $: cheerio.CheerioAPI;
};

let cachedCheerio: CachedCheerio | undefined;

function getCachedBookTextAndParser(): { bookText: string; $: cheerio.CheerioAPI } {
  const bookDir = resolveBookDir();
  const richXmlPath = path.join(bookDir, "input", "rich.xml");
  const stats = fs.statSync(richXmlPath);

  if (
    cachedCheerio &&
    cachedCheerio.richXmlPath === richXmlPath &&
    cachedCheerio.mtimeMs === stats.mtimeMs
  ) {
    return { bookText: cachedCheerio.bookText, $: cachedCheerio.$ };
  }

  const { bookText } = getBookData();
  const $ = cheerio.load(bookText);
  cachedCheerio = { richXmlPath, mtimeMs: stats.mtimeMs, bookText, $ };

  return { bookText, $ };
}

export const getParagraphsFromChapter = (
  chapter: number,
  clean: boolean = false,
  pureText = false,
) => {
  const { bookText, $ } = getCachedBookTextAndParser();
  return getParagraphsFromChapterWithText(chapter, bookText, clean, pureText, $);
};

/**
 * Get section-level attributes for a chapter (e.g., data-epub-type, data-chapter-format)
 * These are needed to preserve semantic information when rewrapping sections after AI processing.
 */
export const getSectionAttributesFromChapter = (chapter: number): Record<string, string> => {
  const { bookText, $ } = getCachedBookTextAndParser();
  return getSectionAttributes(chapter, bookText, $);
};

export const getChapterParagraphsAndSectionAttributes = (
  chapter: number,
  clean: boolean = false,
  pureText = false,
): { paragraphs: ChapterParagraph[]; sectionAttributes: Record<string, string> } => {
  const { bookText, $ } = getCachedBookTextAndParser();
  return {
    paragraphs: getParagraphsFromChapterWithText(chapter, bookText, clean, pureText, $),
    sectionAttributes: getSectionAttributes(chapter, bookText, $),
  };
};

if (require.main === module) {
  const paragraphs = getParagraphsFromChapter(26, true);
  console.log(paragraphs);
}
