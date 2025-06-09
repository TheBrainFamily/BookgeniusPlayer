import fs from "fs";
import path from "path";
import { DOMParser } from "@xmldom/xmldom";
import { xmlToComplexHtml, generateDataFiles } from "./scripts/data/xmlToComplexHtml";
import { BOOK_SLUGS } from "@/consts";
import { extractCharacterMetadata, getCharacterTags } from "./scripts/data/tools/create-book-metadata";

export function generateBookDataFromHtml() {
  // --- Parse CLI arguments ---
  const args = process.argv.slice(2); // Skip node executable and script path
  if (args.length === 0) {
    console.error("Error: Please provide the path to the book directory.");
    console.log("Usage: pnpm start <path_to_book_directory>");
    process.exit(1);
  }
  const bookDirectoryPath = args[0];

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

  if (backgroundsData.length > 0 || audioData.length > 0 || cutSceneData.length > 0) {
    generateDataFiles(backgroundsData, audioData, cutSceneData, bookSlug as BOOK_SLUGS);
  }

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

const ${bookSlugNoDashes}CharactersData: CharacterData[] = ${JSON.stringify(characterMetadata, null, 2)};

export const getCharactersData = (): CharacterData[] => {
  return ${bookSlugNoDashes}CharactersData;
};
`;
  fs.writeFileSync(path.join(bookOutputPath, "getCharactersData.ts"), getCharactersDataContent);

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
  hasAudiobook: false,
  bookStringified: getBookStringified(),
};
`;
  fs.writeFileSync(path.join(bookOutputPath, "bookData.ts"), bookDataContent, "utf8");
}
