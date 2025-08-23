#!/usr/bin/env ts-node

/**
 * find-missing-files.ts
 * Verifies that all assets referenced in book data files exist on disk.
 * Checks background songs, backgrounds, and character avatars.
 * Exits with non-zero status if anything is missing.
 */

import { existsSync, readdirSync } from "node:fs";
import * as path from "node:path";
import type { BackgroundSongForBook, CharacterData, BackgroundForBook } from "@player/types/book";

interface MissingFile {
  book: string;
  type: string;
  file: string;
}

const publicBooksPath = path.join(__dirname, "..", "public_books");
const missing: MissingFile[] = [];

async function importDataFile(bookPath: string, fileName: string): Promise<unknown> {
  const filePath = path.join(bookPath, fileName);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const module = await import(filePath);
    const functionName = path.basename(fileName, ".ts");
    return module[functionName]?.();
  } catch (error) {
    console.error(`Failed to import ${filePath}:`, error);
    return null;
  }
}

function checkCharacterAssets(bookName: string, characters: CharacterData[]) {
  const assetsPath = path.join(publicBooksPath, bookName, "assets");

  characters.forEach((char) => {
    const slug = char.slug.toLowerCase();
    const slugNoSpaces = slug.replace(/[\s-]/g, "");
    const slugWithDashes = slug.replace(/\s+/g, "-");

    // Check all possible variations of character asset names
    [slug, slugNoSpaces, slugWithDashes].forEach((variant) => {
      const assets = [`${variant}.png`, `${variant}-speaks.mp4`, `${variant}-listens.mp4`];

      assets.forEach((asset) => {
        const assetPath = path.join(assetsPath, asset);
        if (!existsSync(assetPath)) {
          missing.push({ book: bookName, type: "character", file: asset });
        }
      });
    });
  });
}

function checkBackgroundSongs(bookName: string, songs: BackgroundSongForBook[]) {
  const assetsPath = path.join(publicBooksPath, bookName, "assets");

  songs.forEach((song) => {
    song.files.forEach((file) => {
      const assetPath = path.join(assetsPath, file);
      if (!existsSync(assetPath)) {
        missing.push({ book: bookName, type: "backgroundSong", file: file });
      }
    });
  });
}

function checkBackgrounds(bookName: string, backgrounds: BackgroundForBook[]) {
  const assetsPath = path.join(publicBooksPath, bookName, "assets");

  backgrounds.forEach((bg) => {
    const assetPath = path.join(assetsPath, bg.file);
    if (!existsSync(assetPath)) {
      missing.push({ book: bookName, type: "background", file: bg.file });
    }
  });
}

async function checkBook(bookName: string) {
  console.log(`\n📚 Checking ${bookName}...`);
  const bookPath = path.join(publicBooksPath, bookName);

  if (!existsSync(bookPath)) {
    console.warn(`⚠️  Book directory not found: ${bookPath}`);
    return;
  }

  // Check character data
  const charactersData = await importDataFile(bookPath, "getCharactersData.ts");
  if (charactersData && Array.isArray(charactersData)) {
    checkCharacterAssets(bookName, charactersData as CharacterData[]);
  }

  // Check background songs
  const backgroundSongs = await importDataFile(bookPath, "getBackgroundSongsForBook.ts");
  if (backgroundSongs && Array.isArray(backgroundSongs)) {
    checkBackgroundSongs(bookName, backgroundSongs as BackgroundSongForBook[]);
  }

  // Check backgrounds
  const backgrounds = await importDataFile(bookPath, "getBackgroundsForBook.ts");
  if (backgrounds && Array.isArray(backgrounds)) {
    checkBackgrounds(bookName, backgrounds as BackgroundForBook[]);
  }
}

async function main() {
  // Get all book directories from public_books
  const bookDirs = readdirSync(publicBooksPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  console.log(`Found ${bookDirs.length} books to check`);

  // Check each book
  for (const bookName of bookDirs) {
    await checkBook(bookName);
  }

  // Report results
  if (missing.length) {
    console.error("\n❌ Missing files:");

    // Group by book
    const byBook = missing.reduce(
      (acc, item) => {
        if (!acc[item.book]) acc[item.book] = [];
        acc[item.book].push(item);
        return acc;
      },
      {} as Record<string, MissingFile[]>,
    );

    Object.entries(byBook).forEach(([book, files]) => {
      console.error(`\n  ${book}:`);
      files.forEach(({ type, file }) => {
        console.error(`    [${type}] ${file}`);
      });
    });

    console.error(`\nTotal missing files: ${missing.length}`);
    process.exit(1);
  }

  console.log("\n✅ All referenced files are present!");
}

main().catch(console.error);
