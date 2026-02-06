import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { resolveBookDir } from "../helpers/resolveBookDir";

export type ChapterFormat = "play" | "mixed" | "prose";

type CachedChapterFormats = {
  richXmlPath: string;
  mtimeMs: number;
  formats: Map<number, ChapterFormat>;
};

let cachedChapterFormats: CachedChapterFormats | undefined;

function loadChapterFormats(): Map<number, ChapterFormat> | null {
  const bookDir = resolveBookDir();
  const richXmlPath = path.join(bookDir, "input", "rich.xml");

  if (!fs.existsSync(richXmlPath)) {
    return null;
  }

  const stats = fs.statSync(richXmlPath);
  if (
    cachedChapterFormats &&
    cachedChapterFormats.richXmlPath === richXmlPath &&
    cachedChapterFormats.mtimeMs === stats.mtimeMs
  ) {
    return cachedChapterFormats.formats;
  }

  const richXml = fs.readFileSync(richXmlPath, "utf8");
  const dom = new JSDOM(richXml, { contentType: "text/html" });
  const doc = dom.window.document;
  const formats = new Map<number, ChapterFormat>();

  const sections = doc.querySelectorAll("section[data-chapter]");
  for (const section of Array.from(sections)) {
    const chapterRaw = section.getAttribute("data-chapter");
    const chapterNum = Number.parseInt(chapterRaw || "0", 10);
    if (chapterNum <= 0 || Number.isNaN(chapterNum)) {
      continue;
    }

    const formatRaw = section.getAttribute("data-chapter-format") as ChapterFormat | null;
    const format =
      formatRaw === "play" || formatRaw === "mixed" || formatRaw === "prose" ? formatRaw : "prose";
    formats.set(chapterNum, format);
  }

  cachedChapterFormats = { richXmlPath, mtimeMs: stats.mtimeMs, formats };

  return formats;
}

export function getChapterFormat(chapterNumber: number): ChapterFormat {
  const formats = loadChapterFormats();

  if (!formats) {
    const envForm = process.env.BOOK_FORM;
    if (envForm === "play" || envForm === "mixed" || envForm === "prose") {
      return envForm;
    }
    return "prose";
  }

  return formats.get(chapterNumber) || "prose";
}

export function getAllChapterFormats(): Map<number, ChapterFormat> {
  const formats = loadChapterFormats();

  if (!formats) {
    return new Map<number, ChapterFormat>();
  }

  return new Map(formats);
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
