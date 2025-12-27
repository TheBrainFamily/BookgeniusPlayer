import fs from "fs";
import path from "path";
import { resolveBookDir } from "../helpers/resolveBookDir";
import { getCurrentBook } from "../helpers/getCurrentBook";
import { generateChaptersXmlFromRich } from "../tools/new-tooling/generate-chapters-xml-from-rich";

export type BookData = { bookText: string; chapters: string };

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

  const currentBookText = fs.readFileSync(path.join(bookDir, "input", "rich.xml"), "utf8");
  const currentBookChapters = generateChaptersXmlFromRich(currentBookText);

  return { bookText: currentBookText, chapters: currentBookChapters };
};
