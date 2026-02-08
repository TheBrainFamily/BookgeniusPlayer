import * as cheerio from "cheerio";
import { getBookData } from "../shared-books-data/getBooksData";
import {
  getParagraphsFromChapterWithText,
  getSectionAttributes,
} from "./getParagraphsFromChapterWithText";
import { getMtimeMs } from "./get-mtime-ms";
import { readBookFile } from "../helpers/readBookFile";
import { FILE_TYPE } from "../helpers/filesHelpers";

type ChapterParagraph = ReturnType<typeof getParagraphsFromChapterWithText>[number];
type CachedCheerio = {
  richXmlPath: string;
  mtimeMs: number;
  bookText: string;
  $: cheerio.CheerioAPI;
};

let cachedCheerio: CachedCheerio | undefined;

function getCachedBookTextAndParser(): { bookText: string; $: cheerio.CheerioAPI } {
  const richXmlPath = readBookFile("rich.xml", FILE_TYPE.INPUT);
  const mtimeMs = getMtimeMs(richXmlPath);
  if (
    cachedCheerio &&
    cachedCheerio.richXmlPath === richXmlPath &&
    cachedCheerio.mtimeMs === getMtimeMs(richXmlPath)
  ) {
    return { bookText: cachedCheerio.bookText, $: cachedCheerio.$ };
  }

  const { bookText } = getBookData();
  const $ = cheerio.load(bookText);
  cachedCheerio = { richXmlPath, mtimeMs, bookText, $ };

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
