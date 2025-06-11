import fs from "fs";
import path from "path";
import { DOMParser } from "@xmldom/xmldom";

import { BOOK_SLUGS } from "@/consts";
import { xmlToComplexHtml, generateDataFiles } from "./scripts/data/xmlToComplexHtml";
import { extractCharacterMetadata, getCharacterTags } from "./scripts/data/tools/create-book-metadata";

export function generateBookDataFromHtml(bookDirectoryPath: string) {
  // --- Parse book.xml ---
  const parser = new DOMParser();
  const bookXml = fs.readFileSync(`${bookDirectoryPath}/book.xml`, "utf8");
  const xmlDoc = parser.parseFromString(bookXml, "text/xml");
  const chapters = xmlDoc.getElementsByTagName("Chapter");
  const bookSlug = xmlDoc.getElementsByTagName("BookSlug")[0].textContent;
  const chapterCount = chapters.length;
  const bookOutputPath = path.resolve("src", "books", bookSlug);

  // --- Generate getBookStringified.ts ---
  const { audioData, backgroundsData, cutSceneData, htmlResult } = xmlToComplexHtml(bookXml, bookSlug as BOOK_SLUGS);

  generateDataFiles(backgroundsData, audioData, cutSceneData, bookSlug as BOOK_SLUGS);

  const getBookStringifiedContent = `const bookStringified = \`<section>${htmlResult}</section>\`;

export const getBookStringified = (): string => {
  return bookStringified;
};
`;
  fs.writeFileSync(path.join(bookOutputPath, "getBookStringified.ts"), getBookStringifiedContent, "utf-8");

  // --- Generate getCharactersData.ts ---
  const characterTags = getCharacterTags(xmlDoc);
  const characterMetadata = extractCharacterMetadata(xmlDoc, characterTags).map((character) => ({ ...character, bookSlug }));
  const bookSlugNoDashes = bookSlug.replaceAll("-", "");
  const getCharactersDataContent = `import type { CharacterData } from "@/books/types";

export const getCharactersData = (): CharacterData[] => ${JSON.stringify(characterMetadata, null, 2)};\n
`;
  fs.writeFileSync(path.join(bookOutputPath, "getCharactersData.ts"), getCharactersDataContent);

  // --- Check for AudiobookTracksDefined.ts existence ---
  const audiobookDataPath = path.join(bookDirectoryPath, "assets", "audiobook_data", "AudiobookTracksDefined.ts");
  const hasAudiobook = fs.existsSync(audiobookDataPath);

  // --- Generate bookData.ts ---
  const bookDataContent = `import type { BookData } from "@/books/types";
import { getBookStringified } from "@/books/${bookSlug}/getBookStringified";

export const bookData: BookData = {
  slug: "${bookSlug}",
  metadata: { title: "${bookSlugNoDashes}" },
  chapters: ${chapterCount},
  themeColors: {
    primaryColor: "#E3F2FD",
    secondaryColor: "#1976D2",
    tertiaryColor: "#90CAF9",
    quaternaryColor: "#0D47A1"
  },
  hasAudiobook: ${hasAudiobook},
  bookStringified: getBookStringified(),
};
`;

  fs.writeFileSync(path.join(bookOutputPath, "bookData.ts"), bookDataContent, "utf8");
}
