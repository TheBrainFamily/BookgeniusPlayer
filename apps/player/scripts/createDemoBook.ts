import fs from "fs";
import path from "path";
import type { CharacterData, BackgroundSongForBook, AudiobookTracksSection, Variant } from "@player/types/book";
import { xmlToComplexHtml } from "./data/xmlToComplexHtml";

type DataWithChapter = { chapter: number; [key: string]: unknown };

type DataType = CharacterData[] | BackgroundSongForBook[] | AudiobookTracksSection[] | Variant[] | DataWithChapter[] | string[] | unknown;

async function importCompiledData(fullBookPath: string, fileName: string): Promise<DataType | null> {
  const filePath = path.join(fullBookPath, "compiled", fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`   ⚠️ File not found: ${filePath}`);
    return null;
  }

  // Dynamic import of the compiled JS file
  const module = await import(filePath);
  const functionName = path.basename(fileName, ".js");
  return module[functionName]?.() || null;
}

function filterDataByChapters<T extends DataWithChapter>(data: T[], demoChapters: number[]): T[] {
  if (!Array.isArray(data)) return data;

  return data.filter((item) => {
    if (typeof item === "object" && "chapter" in item) {
      return demoChapters.includes(item.chapter as number);
    }
    return true; // Keep items without chapter property
  });
}

function filterCharacterData(characters: CharacterData[], demoChapters: number[]): CharacterData[] {
  return characters
    .map((character) => ({ ...character, infoPerChapter: character.infoPerChapter.filter((info) => demoChapters.includes(info.chapter)) }))
    .filter(
      (character) =>
        // Only include characters that appear in demo chapters
        character.infoPerChapter.length > 0,
    );
}

function extractAssetsFromData(data: unknown): Set<string> {
  const assets = new Set<string>();

  function traverse(obj: unknown): void {
    if (typeof obj === "string") {
      // Check if it looks like an asset file
      if (obj.match(/\.(mp3|mp4|png|jpg|jpeg|webp|gif)$/i)) {
        assets.add(obj);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(traverse);
    } else if (typeof obj === "object" && obj !== null) {
      const record = obj as Record<string, unknown>;
      // Look for common asset field names
      if ("file" in record && typeof record.file === "string") {
        assets.add(record.file);
      }
      if ("files" in record && Array.isArray(record.files)) {
        record.files.forEach((f: unknown) => {
          if (typeof f === "string") assets.add(f);
        });
      }
      if ("title" in record && typeof record.title === "string" && record.title.match(/\.(mp3|mp4|png|jpg|jpeg|webp|gif)$/i)) {
        assets.add(record.title);
      }
      // Traverse all properties
      Object.values(record).forEach(traverse);
    }
  }

  traverse(data);
  return assets;
}

export async function createDemoBook(fullBookPath: string, demoBookPath: string, demoChapters: number[], filteredBookXmlPath: string): Promise<void> {
  console.log(`   📚 Creating demo with chapters: ${demoChapters.join(", ")}`);

  // Ensure demo directory exists
  if (!fs.existsSync(demoBookPath)) {
    fs.mkdirSync(demoBookPath, { recursive: true });
  }

  const assetsToInclude = new Set<string>();

  // Always include loader
  assetsToInclude.add("loader.mp4");

  // Process each data file
  const dataFiles = [
    "getBackgroundSongsForBook.js",
    "getBackgroundsForBook.js",
    "getCutScenesForBook.js",
    "getCharactersData.js",
    "getAudiobookTracksForBook.js",
    "getAllVariants.js",
    "getKnownVideoFiles.js",
  ];

  for (const fileName of dataFiles) {
    const baseName = path.basename(fileName, ".js");
    const data = await importCompiledData(fullBookPath, fileName);

    if (!data) continue;

    let filteredData = data;

    // Special handling for different data types
    if (baseName === "getCharactersData") {
      if (Array.isArray(data)) {
        filteredData = filterCharacterData(data as CharacterData[], demoChapters);

        // Add character assets ONLY for characters that appear in demo chapters
        (filteredData as CharacterData[]).forEach((char: CharacterData) => {
          const slug = char.slug.toLowerCase();
          // Try both formats: with spaces replaced by nothing and with dashes
          const slugNoSpaces = slug.replace(/[\s-]/g, "");
          const slugWithDashes = slug.replace(/\s+/g, "-");

          // Add all possible variations of character asset names
          [slug, slugNoSpaces, slugWithDashes].forEach((variant) => {
            assetsToInclude.add(`${variant}.png`);
            assetsToInclude.add(`${variant}-speaks.mp4`);
            assetsToInclude.add(`${variant}-listens.mp4`);
          });
        });
      }
    } else if (baseName === "getKnownVideoFiles") {
      // Skip processing getKnownVideoFiles - we'll regenerate it based on what's actually copied
      continue; // Don't extract assets from this file
    } else if (baseName === "getAllVariants") {
      // Filter variants by chapter if they have chapter property
      if (Array.isArray(data)) {
        filteredData = filterDataByChapters(data as DataWithChapter[], demoChapters);
      }
    } else {
      // Generic filtering for data with chapter property
      if (Array.isArray(data)) {
        filteredData = filterDataByChapters(data as DataWithChapter[], demoChapters);
      }
    }

    // Extract assets from filtered data
    const dataAssets = extractAssetsFromData(filteredData);
    dataAssets.forEach((asset) => assetsToInclude.add(asset));

    // Generate JavaScript file with filtered data directly in compiled folder
    const compiledDir = path.join(demoBookPath, "compiled");
    if (!fs.existsSync(compiledDir)) {
      fs.mkdirSync(compiledDir, { recursive: true });
    }
    const jsContent = `export const ${baseName} = () => ${JSON.stringify(filteredData, null, 2)};\n`;
    const jsPath = path.join(compiledDir, `${baseName}.js`);
    fs.writeFileSync(jsPath, jsContent, "utf-8");
  }

  // Copy other necessary compiled JS files (except getBookStringified which needs regeneration)
  const compiledDir = path.join(demoBookPath, "compiled");
  if (!fs.existsSync(compiledDir)) {
    fs.mkdirSync(compiledDir, { recursive: true });
  }

  const compiledFilesToCopy = ["bookData.js", "getAllVariantsFilter.js", "getAllVariantsFiltered.js"];

  for (const file of compiledFilesToCopy) {
    const srcPath = path.join(fullBookPath, "compiled", file);
    const destPath = path.join(compiledDir, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  // Copy the filtered book.xml and generate getBookStringified from it
  const bookXmlDest = path.join(demoBookPath, "book.xml");
  if (fs.existsSync(filteredBookXmlPath)) {
    fs.copyFileSync(filteredBookXmlPath, bookXmlDest);

    // Read the filtered book.xml and generate HTML
    const bookString = fs.readFileSync(filteredBookXmlPath, "utf8");

    // Get book metadata - we need to parse it
    const metadataMatch = bookString.match(/<Slug>([^<]+)<\/Slug>/);
    const languageMatch = bookString.match(/<Language>([^<]+)<\/Language>/);
    const bookSlug = metadataMatch ? metadataMatch[1] : "unknown";
    const bookLanguage = languageMatch ? languageMatch[1].toLowerCase() : "english";

    // Generate HTML from the filtered book.xml
    const { htmlResult } = xmlToComplexHtml(bookString, bookSlug, bookLanguage, true);

    // Generate getBookStringified.js in compiled folder
    const bookStringifiedContent = `const bookStringified = \`<section>${htmlResult}</section>\`;

export const getBookStringified = () => {
  return bookStringified;
};
`;
    fs.writeFileSync(path.join(compiledDir, "getBookStringified.js"), bookStringifiedContent, "utf-8");
  }

  // Copy chapters and booksContent directories
  const dirsToCopy = ["chapters", "booksContent"];
  for (const dir of dirsToCopy) {
    const srcDir = path.join(fullBookPath, dir);
    const destDir = path.join(demoBookPath, dir);
    if (fs.existsSync(srcDir)) {
      copyDirectory(srcDir, destDir);
    }
  }

  // Copy only the necessary assets
  const srcAssetsDir = path.join(fullBookPath, "assets");
  const destAssetsDir = path.join(demoBookPath, "assets");

  if (fs.existsSync(srcAssetsDir)) {
    if (!fs.existsSync(destAssetsDir)) {
      fs.mkdirSync(destAssetsDir, { recursive: true });
    }

    const allAssets = fs.readdirSync(srcAssetsDir);
    let copiedCount = 0;
    const copiedAssets: string[] = [];

    // Always include loader.mp4 as it's needed for the player
    assetsToInclude.add("loader.mp4");

    for (const asset of allAssets) {
      // ONLY copy assets that are explicitly referenced in the filtered data
      if (assetsToInclude.has(asset)) {
        const srcPath = path.join(srcAssetsDir, asset);
        const destPath = path.join(destAssetsDir, asset);
        fs.copyFileSync(srcPath, destPath);
        copiedAssets.push(asset);
        copiedCount++;
      }
    }

    // Update getKnownVideoFiles with only copied video files in compiled folder
    const videoFiles = copiedAssets.filter((f) => f.endsWith(".mp4"));
    const knownVideoContent = `export const getKnownVideoFiles = () => ${JSON.stringify(videoFiles, null, 2)};\n`;
    const compiledDirFinal = path.join(demoBookPath, "compiled");
    if (!fs.existsSync(compiledDirFinal)) {
      fs.mkdirSync(compiledDirFinal, { recursive: true });
    }
    fs.writeFileSync(path.join(compiledDirFinal, "getKnownVideoFiles.js"), knownVideoContent, "utf-8");

    console.log(`   ✂️ Copied ${copiedCount}/${allAssets.length} assets (only referenced files)`);
  }
}

function copyDirectory(src: string, dest: string) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
