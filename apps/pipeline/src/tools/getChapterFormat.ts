import { JSDOM } from "jsdom";
import { readBookFile, doesBookFileExist } from "../helpers/readBookFile";
import { FILE_TYPE } from "../helpers/filesHelpers";

export type ChapterFormat = "play" | "mixed" | "prose";

function parseRichXml(): Document | null {
  if (!doesBookFileExist("rich.xml", FILE_TYPE.INPUT)) {
    return null;
  }

  const richXml = readBookFile("rich.xml", FILE_TYPE.INPUT);
  const dom = new JSDOM(richXml, { contentType: "text/html" });
  return dom.window.document;
}

export function getChapterFormat(chapterNumber: number): ChapterFormat {
  const doc = parseRichXml();

  if (!doc) {
    const envForm = process.env.BOOK_FORM;
    if (envForm === "play" || envForm === "mixed" || envForm === "prose") {
      return envForm;
    }
    return "prose";
  }

  const section = doc.querySelector(`section[data-chapter="${chapterNumber}"]`);

  if (!section) {
    return "prose";
  }

  const format = section.getAttribute("data-chapter-format") as ChapterFormat | null;

  if (format === "play" || format === "mixed" || format === "prose") {
    return format;
  }

  return "prose";
}

export function getAllChapterFormats(): Map<number, ChapterFormat> {
  const doc = parseRichXml();
  const formats = new Map<number, ChapterFormat>();

  if (!doc) {
    return formats;
  }

  const sections = doc.querySelectorAll("section[data-chapter]");

  for (const section of Array.from(sections)) {
    const chapterNum = parseInt(section.getAttribute("data-chapter") || "0", 10);
    if (chapterNum > 0) {
      const format = section.getAttribute("data-chapter-format") as ChapterFormat | null;
      formats.set(chapterNum, format || "prose");
    }
  }

  return formats;
}

export function hasNonProseChapters(): boolean {
  const formats = getAllChapterFormats();

  for (const format of formats.values()) {
    if (format !== "prose") {
      return true;
    }
  }

  return false;
}
