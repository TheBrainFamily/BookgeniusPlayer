import fs from "fs";
import path from "path";
import { resolveBookDir } from "../helpers/resolveBookDir";
import { getCurrentBook } from "../helpers/getCurrentBook";
import { generateChaptersXmlFromRich } from "../tools/new-tooling/generate-chapters-xml-from-rich";

export type BookData = { bookText: string; chapters: string };
type CachedBookData = { bookDir: string; richXmlPath: string; mtimeMs: number; data: BookData };

let cachedBookData: CachedBookData | undefined;

export function checkIfBookDataExists() {
  const bookSlug = getCurrentBook();

  if (!bookSlug) {
    throw new Error("bookDirectory must be provided as the first argument");
  }

  try {
    resolveBookDir(bookSlug);
  } catch {
    throw new Error(
      "Book dir doesn't exist. Book data not found, check if your book is added to books-data directory and has input and output dirs inside.",
    );
  }
}

export const getBookData = (): BookData => {
  const bookDir = resolveBookDir();
  const richXmlPath = path.join(bookDir, "input", "rich.xml");
  const richXmlStats = fs.statSync(richXmlPath);

  if (
    cachedBookData &&
    cachedBookData.bookDir === bookDir &&
    cachedBookData.richXmlPath === richXmlPath &&
    cachedBookData.mtimeMs === richXmlStats.mtimeMs
  ) {
    return cachedBookData.data;
  }

  const currentBookText = fs.readFileSync(richXmlPath, "utf8");
  const currentBookChapters = generateChaptersXmlFromRich(currentBookText);

  const data = { bookText: currentBookText, chapters: currentBookChapters };
  cachedBookData = { bookDir, richXmlPath, mtimeMs: richXmlStats.mtimeMs, data };

  return data;
};
