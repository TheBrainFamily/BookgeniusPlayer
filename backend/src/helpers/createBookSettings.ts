import { writeBookFile } from "./writeBookFile";
import fs from "fs";
import path from "path";
import { resolveBookDir } from "./resolveBookDir";
import { getHighestChapterNumber } from "./getHighestChapterNumber";
import { getLowestChapterNumber } from "./getLowestChapterNumber";
import { generateChaptersXmlFromRich } from "../tools/new-tooling/generate-chapters-xml-from-rich";

export type BookSettings = {
  numberOfChaptersIdentified: number;
  numberOfChaptersToProcess: number;
  startFromChapter: number;
};

export function createBookSettings() {
  const bookDir = resolveBookDir();

  const currentBookText = fs.readFileSync(path.join(bookDir, "input", "rich.xml"), "utf8");
  const currentBookChapters = generateChaptersXmlFromRich(currentBookText);

  const highestChapterNumber = getHighestChapterNumber(currentBookChapters);
  const lowestChapterNumber = getLowestChapterNumber(currentBookChapters);

  const bookSettings: BookSettings = {
    numberOfChaptersIdentified: highestChapterNumber - lowestChapterNumber + 1, // read from bookChapters.xml
    numberOfChaptersToProcess: highestChapterNumber - lowestChapterNumber + 1, // to make the script run faster for testing
    startFromChapter: lowestChapterNumber,
  };

  writeBookFile("bookSettings.json", JSON.stringify(bookSettings, null, 2));
}

if (require.main === module) {
  createBookSettings();
}
