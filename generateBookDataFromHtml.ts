import fs from "fs";
import path from "path";
import { DOMParser } from "@xmldom/xmldom";
import { xmlToComplexHtml } from "./scripts/data/xmlToComplexHtml";
import { BOOK_SLUGS } from "@/consts";
import { extractCharacterMetadata, getCharacterTags } from "./scripts/data/tools/create-book-metadata";

export function generateBookDataFromHtml() {
  const args = process.argv.slice(2); // Skip node executable and script path

  if (args.length === 0) {
    console.error("Error: Please provide the path to the book directory.");
    console.log("Usage: pnpm start <path_to_book_directory>");
    process.exit(1);
  }

  const bookDirectoryPath = args[0];

  const parser = new DOMParser();
  const book = fs.readFileSync(`${bookDirectoryPath}/book.xml`, "utf8");
  const xmlDoc = parser.parseFromString(book, "text/xml");
  const chapters = xmlDoc.getElementsByTagName("Chapter");
  const bookSlug = xmlDoc.getElementsByTagName("BookSlug")[0].textContent;
  const chapterNumber = chapters.length;

  const bookOutputPath = path.resolve("src", "books", bookSlug);

  const getBookStringified = xmlToComplexHtml(book, bookSlug as BOOK_SLUGS);
  fs.writeFileSync(
    path.join(bookOutputPath, "getBookStringified.ts"),
    `const bookStringified = \`<section>${getBookStringified}</section>\`\n\n export const getBookStringified = (): string => {
  return bookStringified;
};`,
    "utf-8",
  );

  // getCharactersData.ts

  const characterTags = getCharacterTags(xmlDoc);

  const metadata = extractCharacterMetadata(xmlDoc, characterTags).map((characterMetadata) => ({ ...characterMetadata, bookSlug }));

  const bookSlugWithoutDashes = bookSlug.replaceAll("-", "");

  fs.writeFileSync(
    path.join(bookOutputPath, "getCharactersData.ts"),
    `import type { CharacterData } from "@/books/types";\n\nconst ${bookSlugWithoutDashes}CharactersData: CharacterData[] = ${JSON.stringify(metadata, null, 2)}\n\n export const getCharactersData = (): CharacterData[] => {
  return ${bookSlugWithoutDashes}CharactersData;
};`,
  );

  const bookData = `import type { BookData } from "@/books/types";\nimport { getBookStringified } from "@/books/${bookSlug}/getBookStringified";
  export const bookData: BookData = {
    slug: "${bookSlug}",
    metadata: { title: "${bookSlugWithoutDashes}" },
    chapters: ${chapterNumber},
    themeColors: { primaryColor: "#E3F2FD", secondaryColor: "#1976D2", tertiaryColor: "#90CAF9", quaternaryColor: "#0D47A1" },
    hasAudiobook: false,
    bookStringified: getBookStringified(),
    audioPrompt: "",
  };`;

  fs.writeFileSync(path.join(bookOutputPath, "bookData.ts"), bookData, "utf8");
}
