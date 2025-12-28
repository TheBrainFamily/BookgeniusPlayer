import { writeBookFile } from "./writeBookFile";
import fs from "fs";
import path from "path";
import { resolveBookDir } from "./resolveBookDir";
import { getHighestChapterNumber } from "./getHighestChapterNumber";
import { getLowestChapterNumber } from "./getLowestChapterNumber";
import { generateChaptersXmlFromRich } from "../tools/new-tooling/generate-chapters-xml-from-rich";
import { JSDOM } from "jsdom";

export type BookSettings = {
  numberOfChaptersIdentified: number;
  numberOfChaptersToProcess: number;
  startFromChapter: number;
  title?: string;
  author?: string;
  language?: string;
};

function extractMetadataFromFb2(bookDir: string): { title?: string; author?: string; language?: string } {
  const inputDir = path.join(bookDir, "input");
  const fb2Files = fs.readdirSync(inputDir).filter((f) => f.endsWith(".fb2"));

  if (fb2Files.length === 0) {
    return {};
  }

  const fb2Content = fs.readFileSync(path.join(inputDir, fb2Files[0]), "utf8");
  const dom = new JSDOM(fb2Content, { contentType: "text/xml" });
  const doc = dom.window.document;

  const titleInfo = doc.querySelector("description > title-info");
  const title = titleInfo?.querySelector("book-title")?.textContent || undefined;
  const firstName = titleInfo?.querySelector("author > first-name")?.textContent || "";
  const lastName = titleInfo?.querySelector("author > last-name")?.textContent || "";
  const author = [firstName, lastName].filter(Boolean).join(" ") || undefined;
  const language = titleInfo?.querySelector("lang")?.textContent || undefined;

  return { title, author, language };
}

export function createBookSettings() {
  const bookDir = resolveBookDir();

  const currentBookText = fs.readFileSync(path.join(bookDir, "input", "rich.xml"), "utf8");
  const currentBookChapters = generateChaptersXmlFromRich(currentBookText);

  const highestChapterNumber = getHighestChapterNumber(currentBookChapters);
  const lowestChapterNumber = getLowestChapterNumber(currentBookChapters);

  const metadata = extractMetadataFromFb2(bookDir);

  const bookSettings: BookSettings = {
    numberOfChaptersIdentified: highestChapterNumber - lowestChapterNumber + 1,
    numberOfChaptersToProcess: highestChapterNumber - lowestChapterNumber + 1,
    startFromChapter: lowestChapterNumber,
    ...metadata,
  };

  writeBookFile("bookSettings.json", JSON.stringify(bookSettings, null, 2));
}

if (require.main === module) {
  createBookSettings();
}
