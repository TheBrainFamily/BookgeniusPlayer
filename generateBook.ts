import fs from "fs";
import path from "path";
import { DOMParser } from "@xmldom/xmldom";

import { setKnownVideos } from "@/utils/getFilePathsForName";
import { generateBookDataFromHtml } from "./generateBookDataFromHtml";
import { BookData } from "@/books/types";
import { validateAndNormalizeBookPath } from "./validateAndNormalizeBookPath";

async function generateBook(bookDirectoryPath: string): Promise<{ bookSlug: string; bookTitle: string }> {
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

  console.log("📖 Read book.xml successfully");

  const bookSlugElements = xmlDoc.getElementsByTagName("BookSlug");
  if (bookSlugElements.length === 0) {
    throw new Error("No BookSlug element found in book.xml");
  }

  const bookSlug = bookSlugElements[0].textContent;
  if (!bookSlug || bookSlug.trim() === "") {
    throw new Error("BookSlug element is empty or null");
  }

  const bookOutputPath = path.resolve("src", "books", bookSlug);
  if (!fs.existsSync(bookOutputPath)) {
    fs.mkdirSync(bookOutputPath, { recursive: true });
  }

  // Generate getKnownVideoFiles.ts
  const assetsPath = path.join(bookDirectoryPath, "assets");
  let videoFiles: string[] = [];

  if (fs.existsSync(assetsPath)) {
    videoFiles = fs.readdirSync(assetsPath).filter((file) => file.endsWith(".mp4"));
  }

  setKnownVideos(videoFiles);
  const getKnownVideoFiles = `export const getKnownVideoFiles = () => ${JSON.stringify(videoFiles, null, 2)};\n`;
  fs.writeFileSync(path.join(bookOutputPath, "getKnownVideoFiles.ts"), getKnownVideoFiles, "utf-8");

  // Generate getAudiobookTracksForBook.ts
  const audiobookDataPath = path.join(bookDirectoryPath, "assets", "audiobook_data", "AudiobookTracksDefined.ts");
  let getAudiobookTracksForBookContent: string;

  if (fs.existsSync(audiobookDataPath)) {
    // Read the AudiobookTracksDefined content and inline it
    const audiobookContent = fs.readFileSync(audiobookDataPath, "utf-8");

    // Extract the exported data from the file (assumes export const AudiobookTracksDefined = [...])
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

  // Generate book data from HTML
  generateBookDataFromHtml(bookDirectoryPath);

  console.log(`✅ Book data generated successfully for ${bookSlug}`);
  console.log(`📁 Output directory: ${bookOutputPath}`);

  // Wait a moment for file generation to complete
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const bookDataFilePath = path.join(bookOutputPath, "bookData.ts");

  console.log(`📦 Loading book data from: ${bookDataFilePath}`);
  if (!fs.existsSync(bookDataFilePath)) {
    throw new Error(`bookData.ts not found at ${bookDataFilePath}. Make sure generateBookDataFromHtml() creates the bookData.ts file`);
  }

  // Convert to file URL for proper dynamic import
  const fileUrl = `file://${path.resolve(bookDataFilePath)}`;
  const bookModule = (await import(fileUrl)) as { bookData: BookData };
  const { bookData } = bookModule;

  if (!bookData || !bookData.slug || !bookData.metadata || !bookData.metadata.title) {
    throw new Error('Invalid bookData.ts structure. It must export a default object with "slug" and "metadata.title" properties.');
  }

  return { bookSlug: bookData.slug, bookTitle: bookData.metadata.title };
}

async function main() {
  const args = process.argv.slice(2);
  const { bookDirectoryPath } = validateAndNormalizeBookPath(args);

  try {
    console.log(`🔨 Generating book data for ${bookDirectoryPath}...`);
    const { bookSlug, bookTitle } = await generateBook(bookDirectoryPath);
    console.log(`🎉 Book generation completed for ${bookSlug} (${bookTitle})`);
  } catch (error) {
    console.error(`❌ Generating book failed:`);

    if (error instanceof Error) {
      console.error("Message:", error.message);
    } else {
      console.error("An unknown error occurred:", error);
    }

    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { generateBook };
