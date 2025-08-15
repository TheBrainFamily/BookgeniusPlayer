import fs from "fs";
import path from "path";
import { DOMParser, Document } from "@xmldom/xmldom";

import { BookData } from "@player/types/book";
import { getListeningMediaFilePathForName, getPictureFileNameForName, getTalkingMediaFilePathForName, setKnownVideos } from "@player/utils/getFilePathsForName";
import { generateDataFiles, xmlToComplexHtml } from "./data/xmlToComplexHtml";
import { extractCharacterMetadata, getCharacterTags } from "./data/tools/create-book-metadata";
import { validateAndNormalizeBookPath } from "./validateAndNormalizeBookPath";
import { getBookAssetUrl } from "@player/utils/assetUrls";

async function generateBook(bookDirectoryPath: string, bookOutputPath?: string): Promise<{ bookSlug: string; bookTitle: string; bookLanguage: string }> {
  // Parse book.xml and extract book slug and other data
  const { metadata, xmlDoc, bookString } = parseBookXmlData(bookDirectoryPath);

  // Ensure output directory exists
  bookOutputPath = bookDirectoryPath;
  console.log("bookOutputPath", bookOutputPath);
  if (!fs.existsSync(bookOutputPath)) {
    fs.mkdirSync(bookOutputPath, { recursive: true });
  }

  // Generate files
  generateKnownVideoFiles(bookDirectoryPath, bookOutputPath);
  generateAudiobookTracksFile(bookDirectoryPath, bookOutputPath);
  generateBookDataFiles(bookDirectoryPath, metadata, xmlDoc, bookString, bookOutputPath);

  // Load and validate generated book data
  console.time("loadAndValidateBookData");
  const bookData = await loadAndValidateBookData(bookOutputPath);
  console.timeEnd("loadAndValidateBookData");

  console.log(`✅ Book data generated successfully for ${metadata.slug} (Language: ${metadata.language})`);
  console.log(`📁 Output directory: ${bookOutputPath}`);

  return { bookSlug: bookData.slug, bookTitle: bookData.metadata.title, bookLanguage: metadata.language };
}

export function parseBookXmlData(bookDirectoryPath: string) {
  const bookXmlPath = path.join(bookDirectoryPath, "book.xml");
  if (!fs.existsSync(bookXmlPath)) {
    throw new Error(`book.xml not found at ${bookXmlPath}`);
  }

  const parser = new DOMParser();
  const bookString = fs.readFileSync(bookXmlPath, "utf8");
  const xmlDoc = parser.parseFromString(bookString, "text/xml");

  const parserError = xmlDoc.getElementsByTagName("parsererror");
  if (parserError.length > 0) {
    throw new Error(`Failed to parse book.xml: ${parserError[0].textContent}`);
  }

  const metadataNode = xmlDoc.getElementsByTagName("BookMetadata")[0];
  if (!metadataNode) {
    throw new Error("Tag <BookMetadata> not found in book.xml");
  }

  const getText = (tagName: string, defaultValue?: string): string => {
    const elements = metadataNode.getElementsByTagName(tagName);
    if (elements.length > 0 && elements[0].textContent) {
      return elements[0].textContent.trim();
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }

    throw new Error(`Required tag <${tagName}> not found or is empty inside <BookMetadata>`);
  };

  const metadata = {
    slug: getText("Slug"),
    title: getText("Title"),
    author: getText("Author"),
    language: getText("Language", "polish").toLowerCase(),
    simplifiedIconColor: getText("SimplifiedIconColor", "#4CAF50"),
    form: getText("Form", "book").toLowerCase(),
  };

  return { metadata, xmlDoc, bookString };
}

function generateKnownVideoFiles(bookDirectoryPath: string, bookOutputPath: string): void {
  const assetsPath = path.join(bookDirectoryPath, "assets");
  let videoFiles: string[] = [];

  if (fs.existsSync(assetsPath)) {
    videoFiles = fs.readdirSync(assetsPath).filter((file) => file.endsWith(".mp4"));
  }

  setKnownVideos(videoFiles);
  const getKnownVideoFiles = `export const getKnownVideoFiles = (): string[] => ${JSON.stringify(videoFiles, null, 2)};\n`;
  fs.writeFileSync(path.join(bookOutputPath, "getKnownVideoFiles.ts"), getKnownVideoFiles, "utf-8");
}

function generateAudiobookTracksFile(bookDirectoryPath: string, bookOutputPath: string) {
  const audiobookDataPath = path.join(bookDirectoryPath, "assets", "audiobook_data", "AudiobookTracksDefined.ts");
  let getAudiobookTracksForBookContent: string;

  if (fs.existsSync(audiobookDataPath)) {
    const audiobookContent = fs.readFileSync(audiobookDataPath, "utf-8");

    const match = audiobookContent.match(/export\s+const\s+AudiobookTracksDefined\s*=\s*(\[[\s\S]*?\]);/);
    const audiobookData = match ? match[1] : "[]";

    getAudiobookTracksForBookContent = `import { AudiobookTracksSection } from "@player/types/book";

const AudiobookTracksDefined: AudiobookTracksSection[] = ${audiobookData};

export const getAudiobookTracksForBook = (): AudiobookTracksSection[] => {
  return AudiobookTracksDefined;
};
`;
  } else {
    getAudiobookTracksForBookContent = `import { AudiobookTracksSection } from "@player/types/book";

export const getAudiobookTracksForBook = (): AudiobookTracksSection[] => {
  return [];
};
`;
  }

  fs.writeFileSync(path.join(bookOutputPath, "getAudiobookTracksForBook.ts"), getAudiobookTracksForBookContent, "utf-8");
}

export function generateCharacterMetadata(xmlDoc: Document, bookString: string, bookForm: string, bookSlug: string) {
  const characterTags = getCharacterTags(xmlDoc);
  const parser = new DOMParser();
  // Removes all spans with their id as "chX-pY-sZ" and <em> which is inside the stage direction
  const updatedString = bookString.replaceAll(/<span id="ch\d+-p\d+-s\d+">(.*?)<\/span>/g, "$1").replaceAll(/<\/?em[^>]*>/g, "");
  const xmlDocWithoutSpans = parser.parseFromString(updatedString, "text/xml");

  return extractCharacterMetadata(xmlDocWithoutSpans, characterTags, bookForm, bookSlug).map((character) => ({
    ...character,
    bookSlug,
    imageUrl: getBookAssetUrl(getPictureFileNameForName(character.slug)),
    listeningUrl: getListeningMediaFilePathForName(character.slug, bookSlug),
    talkingUrl: getTalkingMediaFilePathForName(character.slug, bookSlug),
  }));
}

function generateBookDataFiles(bookDirectoryPath: string, metadata: ReturnType<typeof parseBookXmlData>["metadata"], xmlDoc: Document, bookString: string, bookOutputPath: string) {
  // --- Generate getBookStringified.ts ---
  const { backgroundsData, audioData, cutSceneData, htmlResult, chapterTitles } = xmlToComplexHtml(bookString, metadata.slug, metadata.language);

  // Check if the required media files exist in the book directory
  const requiredMediaFiles = ["getBackgroundsForBook.ts", "getBackgroundSongsForBook.ts", "getCutScenesForBook.ts"];
  const allMediaFilesExist = requiredMediaFiles.every((file) => fs.existsSync(path.join(bookDirectoryPath, file)));

  if (allMediaFilesExist) {
    // If all files exist, copy them instead of generating
    requiredMediaFiles.forEach((mediaBookFile) => {
      fs.copyFileSync(path.join(bookDirectoryPath, mediaBookFile), path.join(bookOutputPath, mediaBookFile), fs.constants.COPYFILE_FICLONE);
    });
  } else {
    // If files don't exist, generate them
    generateDataFiles(backgroundsData, audioData, cutSceneData, metadata.slug);
  }

  const getAllVariantsPath = path.join(bookDirectoryPath, "getAllVariants.ts");
  if (fs.existsSync(getAllVariantsPath)) {
    fs.copyFileSync(getAllVariantsPath, path.join(bookOutputPath, "getAllVariants.ts"), fs.constants.COPYFILE_FICLONE);
  } else {
    const getAllVariantsContent = `export const getAllVariants = () => [];`;
    fs.writeFileSync(path.join(bookOutputPath, "getAllVariants.ts"), getAllVariantsContent, "utf-8");
  }

  const getBookStringifiedContent = `const bookStringified = \`<section>${htmlResult}</section>\`;

export const getBookStringified = (): string => {
  return bookStringified;
};
`;

  const pathToOverwrite = path.join(bookOutputPath, "getBookStringified.ts");
  console.log("pathToOverwrite", pathToOverwrite);
  fs.writeFileSync(pathToOverwrite, getBookStringifiedContent, "utf-8");

  // --- Generate getCharactersData.ts ---
  const characterMetadata = generateCharacterMetadata(xmlDoc, bookString, metadata.form, metadata.slug);
  const getCharactersDataContent = `import type { CharacterData } from "@player/types/book";
  
  export const getCharactersData = (): CharacterData[] => ${JSON.stringify(characterMetadata, null, 2)};\n
  `;
  fs.writeFileSync(path.join(bookOutputPath, "getCharactersData.ts"), getCharactersDataContent);

  // --- Check for AudiobookTracksDefined.ts existence ---
  const audiobookDataPath = path.join(bookDirectoryPath, "assets", "audiobook_data", "AudiobookTracksDefined.ts");
  const hasAudiobook = fs.existsSync(audiobookDataPath);

  // --- Generate bookData.ts ---
  const bookDataContent = `import type { BookData } from "@player/types/book";

export const bookData: BookData = {
  slug: "${metadata.slug}",
  metadata: {
    title: "${metadata.title}",
    author: "${metadata.author}",
    language: "${metadata.language}",
    bookForm: "${metadata.form}"
  },
  chapters: ${JSON.stringify(chapterTitles, null, 2)},
  themeColors: {
    primaryColor: "#E3F2FD",
    secondaryColor: "#1976D2",
    tertiaryColor: "#90CAF9",
    quaternaryColor: "#0D47A1",
    simplifiedIconColor: "${metadata.simplifiedIconColor}"
  },
  hasAudiobook: ${hasAudiobook}
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
    const bookOutputPath = path.resolve(bookDirectoryPath);
    const { bookSlug, bookTitle, bookLanguage } = await generateBook(bookDirectoryPath, bookOutputPath);
    console.log(`🎉 Book generation completed for ${bookSlug} (${bookTitle}) - Language: ${bookLanguage}`);
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
