import fs from "fs";
import path from "path";
import { DOMParser, Document } from "@xmldom/xmldom";

import { BookData } from "@/books/types";
import { setKnownVideos } from "@/utils/getFilePathsForName";
import { xmlToComplexHtml, generateDataFiles } from "./scripts/data/xmlToComplexHtml";
import { extractCharacterMetadata, getCharacterTags } from "./scripts/data/tools/create-book-metadata";
import { validateAndNormalizeBookPath } from "./validateAndNormalizeBookPath";

async function generateBook(bookDirectoryPath: string): Promise<{ bookSlug: string; bookTitle: string }> {
  // Parse book.xml and extract book slug and other data
  const { bookSlug, xmlDoc } = parseBookXmlData(bookDirectoryPath);

  // Ensure output directory exists
  const bookOutputPath = path.resolve("src", "books", bookSlug);
  if (!fs.existsSync(bookOutputPath)) {
    fs.mkdirSync(bookOutputPath, { recursive: true });
  }

  // Generate files
  generateKnownVideoFiles(bookDirectoryPath, bookOutputPath);
  generateAudiobookTracksFile(bookDirectoryPath, bookOutputPath);
  generateBookDataFiles(bookDirectoryPath, bookSlug, xmlDoc);

  // Wait a moment for file generation to complete
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Load and validate generated book data
  const bookData = await loadAndValidateBookData(bookOutputPath);

  console.log(`✅ Book data generated successfully for ${bookSlug}`);
  console.log(`📁 Output directory: ${bookOutputPath}`);

  return { bookSlug: bookData.slug, bookTitle: bookData.metadata.title };
}

function parseBookXmlData(bookDirectoryPath: string): { bookSlug: string; xmlDoc: Document } {
  const bookXmlPath = `${bookDirectoryPath}/book.xml`;
  if (!fs.existsSync(bookXmlPath)) {
    throw new Error(`book.xml not found at ${bookXmlPath}`);
  }

  const parser = new DOMParser();
  const book = fs.readFileSync(bookXmlPath, "utf8");
  const xmlDoc = parser.parseFromString(book, "text/xml");

  const parserError = xmlDoc.getElementsByTagName("parsererror");
  if (parserError.length > 0) {
    throw new Error(`Failed to parse book.xml: ${parserError[0].textContent}`);
  }

  const bookSlugElements = xmlDoc.getElementsByTagName("BookSlug");
  if (bookSlugElements.length === 0) {
    throw new Error("No BookSlug element found in book.xml");
  }

  const bookSlug = bookSlugElements[0].textContent;
  if (!bookSlug || bookSlug.trim() === "") {
    throw new Error("BookSlug element is empty or null");
  }

  return { bookSlug, xmlDoc };
}

function generateKnownVideoFiles(bookDirectoryPath: string, bookOutputPath: string): void {
  const assetsPath = path.join(bookDirectoryPath, "assets");
  let videoFiles: string[] = [];

  if (fs.existsSync(assetsPath)) {
    videoFiles = fs.readdirSync(assetsPath).filter((file) => file.endsWith(".mp4"));
  }

  setKnownVideos(videoFiles);
  const getKnownVideoFiles = `export const getKnownVideoFiles = () => ${JSON.stringify(videoFiles, null, 2)};\n`;
  fs.writeFileSync(path.join(bookOutputPath, "getKnownVideoFiles.ts"), getKnownVideoFiles, "utf-8");
}

async function generateAudiobookTracksFile(bookDirectoryPath: string, bookOutputPath: string) {
  const audiobookDataPath = path.join(bookDirectoryPath, "assets", "audiobook_data", "AudiobookTracksDefined.ts");
  let getAudiobookTracksForBookContent: string;

  if (fs.existsSync(audiobookDataPath)) {
    const audiobookContent = fs.readFileSync(audiobookDataPath, "utf-8");

    const match = audiobookContent.match(/export\s+const\s+AudiobookTracksDefined\s*=\s*(\[[\s\S]*?\]);/);
    const audiobookData = match ? match[1] : "[]";

    getAudiobookTracksForBookContent = `export type WordPosition = [string, number];
export type AudiobookTracksSection = { chapter: number; paragraph: number; file: string; smile_id?: string; "clip-begin": number; "clip-end": number; words?: WordPosition[] };

const AudiobookTracksDefined: AudiobookTracksSection[] = ${audiobookData};

export const getAudiobookTracksForBook = (): AudiobookTracksSection[] => {
  return AudiobookTracksDefined;
};
`;
  } else {
    getAudiobookTracksForBookContent = `export type WordPosition = [string, number];
export type AudiobookTracksSection = { chapter: number; paragraph: number; file: string; smile_id?: string; "clip-begin": number; "clip-end": number; words?: WordPosition[] };

export const getAudiobookTracksForBook = (): AudiobookTracksSection[] => {
  return [];
};
`;
  }

  fs.writeFileSync(path.join(bookOutputPath, "getAudiobookTracksForBook.ts"), getAudiobookTracksForBookContent, "utf-8");
}

function generateBookDataFiles(bookDirectoryPath: string, bookSlug: string, xmlDoc: Document): void {
  const chapters = xmlDoc.getElementsByTagName("Chapter");
  const chapterCount = chapters.length;
  const bookOutputPath = path.resolve("src", "books", bookSlug);

  // --- Generate getBookStringified.ts ---
  const bookXml = fs.readFileSync(`${bookDirectoryPath}/book.xml`, "utf8");
  const { audioData, backgroundsData, cutSceneData, htmlResult } = xmlToComplexHtml(bookXml, bookSlug);

  generateDataFiles(backgroundsData, audioData, cutSceneData, bookSlug);

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

async function loadAndValidateBookData(bookOutputPath: string): Promise<BookData> {
  const bookDataFilePath = path.join(bookOutputPath, "bookData.ts");

  if (!fs.existsSync(bookDataFilePath)) {
    throw new Error(`bookData.ts not found at ${bookDataFilePath}.`);
  }

  // Convert to file URL for proper dynamic import
  const fileUrl = `file://${path.resolve(bookDataFilePath)}`;
  const bookModule = (await import(fileUrl)) as { bookData: BookData };
  const { bookData } = bookModule;

  if (!bookData || !bookData.slug || !bookData.metadata || !bookData.metadata.title) {
    throw new Error('Invalid bookData.ts structure. It must export a default object with "slug" and "metadata.title" properties.');
  }

  return bookData;
}

async function main() {
  const args = process.argv.slice(2);
  const { bookDirectoryPath } = validateAndNormalizeBookPath(args);

  try {
    console.log(`🔨 Generating book data for ${bookDirectoryPath}...`);
    const { bookSlug, bookTitle } = await generateBook(bookDirectoryPath);
    console.log(`🎉 Book generation completed for ${bookSlug} (${bookTitle})`);
  } catch (error) {
    console.error(`❌ Book generation failed:`);

    if (error instanceof Error) {
      console.error("Message:", error.message);
    } else {
      console.error("An unknown error occurred:", error);
    }

    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error in main:", error);
    process.exit(1);
  });
}

export { generateBook };
