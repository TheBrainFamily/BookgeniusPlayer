/**
 * Standard Ebooks Book Import Script
 *
 * Imports a Standard Ebooks play/book into Convex CMS.
 * Converts SE XHTML to HTML with play format (data-speaker, data-stage-direction).
 *
 * Usage:
 *   bun run src/tools/se-converter/importSEBook.ts <se-book-slug> [--target-slug <slug>]
 *
 * Examples:
 *   bun run src/tools/se-converter/importSEBook.ts william-shakespeare_macbeth
 *   bun run src/tools/se-converter/importSEBook.ts william-shakespeare_macbeth --target-slug Macbeth
 */

import * as fs from "fs";
import * as path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@bookgenius/convex/_generated/api";
import { convertSEBook, getSEBookImagesDir, type SEImageReference } from "./index";
import { JSDOM } from "jsdom";

const SE_BOOKS_DIR = path.resolve(__dirname, "../../../standardebooks-data/books");
const LEGACY_BOOKS_DIR = path.resolve(__dirname, "../../../../../books");

interface SEMetadata {
  slug: string;
  repoName: string;
  title: string;
  author: string;
  description: string;
  longDescription: string;
  wordCount: number;
  language: string;
  subjects: string[];
  wikipediaUrl?: string;
  published: string;
}

interface BookFolderExtra {
  type: "book";
  title: string;
  author: string;
  language: string;
  form: string;
  description?: string;
}

interface CharacterFolderExtra {
  type: "character";
  displayName: string;
  summary: string;
}

const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  console.error("Missing CONVEX_URL environment variable");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

function parseArgs(): { seSlug: string; targetSlug: string } {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: bun run src/tools/se-converter/importSEBook.ts <se-book-slug> [--target-slug <slug>]");
    console.error("Example: bun run src/tools/se-converter/importSEBook.ts william-shakespeare_macbeth");
    process.exit(1);
  }

  const seSlug = args[0];
  let targetSlug = seSlug;

  const targetIdx = args.indexOf("--target-slug");
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    targetSlug = args[targetIdx + 1];
  } else {
    const parts = seSlug.split("_");
    if (parts.length > 1) {
      targetSlug = parts.slice(1).join("-");
      targetSlug = targetSlug
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("-");
    }
  }

  return { seSlug, targetSlug };
}

function loadSEMetadata(seSlug: string): SEMetadata {
  const metadataPath = path.join(SE_BOOKS_DIR, seSlug, "metadata.json");
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Metadata not found: ${metadataPath}`);
  }
  return JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
}

function extractCharactersFromHtml(html: string): { slug: string; displayName: string }[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const speakerDivs = doc.querySelectorAll("[data-speaker]");
  const characterMap = new Map<string, string>();

  for (const div of Array.from(speakerDivs)) {
    const speakerAttr = div.getAttribute("data-speaker") || "";
    const slugs = speakerAttr.split(" ").filter(Boolean);

    for (const slug of slugs) {
      if (!characterMap.has(slug)) {
        const labelEl = div.querySelector("[data-speaker-label]");
        const displayName = labelEl?.textContent?.trim() || slug.replace(/-/g, " ");
        characterMap.set(slug, displayName);
      }
    }
  }

  const characterMentions = doc.querySelectorAll("[data-c]");
  for (const mention of Array.from(characterMentions)) {
    const slug = mention.getAttribute("data-c") || "";
    if (slug && !characterMap.has(slug)) {
      const displayName = mention.textContent?.trim() || slug.replace(/-/g, " ");
      characterMap.set(slug, displayName);
    }
  }

  return Array.from(characterMap.entries())
    .map(([slug, displayName]) => ({ slug, displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function splitHtmlIntoChapters(html: string): { chapterNumber: number; html: string; title: string | null }[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const sections = doc.querySelectorAll("section[data-chapter]");
  const chapters: { chapterNumber: number; html: string; title: string | null }[] = [];

  for (const section of Array.from(sections)) {
    const chapterNumber = parseInt(section.getAttribute("data-chapter") || "0", 10);
    const titleEl = section.querySelector("h2, h3, h4, h5");
    const title = titleEl?.textContent?.trim() || null;

    chapters.push({ chapterNumber, html: section.outerHTML, title });
  }

  return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
}

async function createFolderIfNeeded(folderPath: string, extra?: object): Promise<void> {
  try {
    const existing = await client.query(api.cli.getFolder, { path: folderPath });
    if (existing) {
      console.log(`  Folder exists: ${folderPath}`);
      return;
    }
  } catch {}

  try {
    await client.mutation(api.cli.createFolderByPath, { path: folderPath, extra });
    console.log(`  Created folder: ${folderPath}`);
  } catch (error) {
    console.error(`  Failed to create folder ${folderPath}:`, error);
  }
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
  };
  return types[ext] || "application/octet-stream";
}

async function uploadFile(folderPath: string, basename: string, filePath: string): Promise<boolean> {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const file = fs.readFileSync(filePath);
  const contentType = getContentType(basename);

  try {
    const { intentId, uploadUrl, backend } = await client.mutation(api.generateUploadUrl.startUpload, {
      folderPath,
      basename,
      publish: true,
    });

    const response = await fetch(uploadUrl, {
      method: backend === "r2" ? "PUT" : "POST",
      headers: { "Content-Type": contentType },
      body: file,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const uploadResponse = backend === "convex" ? await response.json() : undefined;

    await client.mutation(api.generateUploadUrl.finishUpload, {
      intentId,
      uploadResponse,
      size: file.length,
      contentType,
    });

    console.log(`  Uploaded: ${folderPath}/${basename}`);
    return true;
  } catch (error) {
    console.error(`  Failed to upload ${basename}:`, error);
    return false;
  }
}

async function step1_CreateFolderStructure(bookPath: string, metadata: SEMetadata): Promise<void> {
  console.log("\n=== Step 1: Create Folder Structure ===");

  await createFolderIfNeeded("books");

  const bookExtra: BookFolderExtra = {
    type: "book",
    title: metadata.title,
    author: metadata.author,
    language: metadata.language.split("-")[0],
    form: "Play",
    description: metadata.description,
  };
  await createFolderIfNeeded(bookPath, bookExtra);

  await createFolderIfNeeded(`${bookPath}/characters`);
  await createFolderIfNeeded(`${bookPath}/chapters`);
  await createFolderIfNeeded(`${bookPath}/chapters-source`);
  await createFolderIfNeeded(`${bookPath}/backgrounds`);
  await createFolderIfNeeded(`${bookPath}/music`);
  await createFolderIfNeeded(`${bookPath}/figures`);
}

async function step2_ImportCharacters(
  bookPath: string,
  characters: { slug: string; displayName: string }[],
  legacyAssetsDir: string | null,
): Promise<number> {
  console.log("\n=== Step 2: Import Characters ===");
  console.log(`  Found ${characters.length} characters in the play`);

  for (const char of characters) {
    console.log(`  Processing: ${char.displayName} (${char.slug})`);

    const charPath = `${bookPath}/characters/${char.slug}`;
    const charExtra: CharacterFolderExtra = { type: "character", displayName: char.displayName, summary: "" };
    await createFolderIfNeeded(charPath, charExtra);

    if (legacyAssetsDir) {
      const avatarExtensions = [".png", ".jpg", ".jpeg", ".webp"];
      for (const ext of avatarExtensions) {
        const avatarFile = path.join(legacyAssetsDir, `${char.slug}${ext}`);
        if (fs.existsSync(avatarFile)) {
          await uploadFile(charPath, `avatar-large${ext}`, avatarFile);
          await uploadFile(charPath, `avatar${ext}`, avatarFile);
          break;
        }
      }

      const speaksFile = path.join(legacyAssetsDir, `${char.slug}-speaks.mp4`);
      const listensFile = path.join(legacyAssetsDir, `${char.slug}-listens.mp4`);
      await uploadFile(charPath, "speaks.mp4", speaksFile);
      await uploadFile(charPath, "listens.mp4", listensFile);
    }
  }

  return characters.length;
}

async function step3_ImportChapters(
  bookPath: string,
  chapters: { chapterNumber: number; html: string; title: string | null }[],
): Promise<number> {
  console.log("\n=== Step 3: Import Chapters (HTML Source Format) ===");
  console.log(`  Found ${chapters.length} chapters/acts`);

  for (const chapter of chapters) {
    console.log(`  Chapter ${chapter.chapterNumber}: ${chapter.title || "(no title)"}`);

    const dom = new JSDOM(chapter.html);
    const section = dom.window.document.querySelector("section");
    const paragraphCount = section?.children.length || 0;

    await client.action(api.chapterCompiler.uploadHtmlSourceChapter, {
      bookPath,
      chapterNumber: chapter.chapterNumber,
      htmlContent: chapter.html,
      title: chapter.title || undefined,
      paragraphCount,
    });
  }

  return chapters.length;
}

async function step4_ImportFigures(bookPath: string, seSlug: string, images: SEImageReference[]): Promise<number> {
  console.log("\n=== Step 4: Import Figures ===");

  if (images.length === 0) {
    console.log("  No figures to import");
    return 0;
  }

  console.log(`  Found ${images.length} figures to import`);

  const imagesDir = getSEBookImagesDir(seSlug);
  if (!fs.existsSync(imagesDir)) {
    console.log(`  Images directory not found: ${imagesDir}`);
    return 0;
  }

  const figuresPath = `${bookPath}/figures`;
  let uploaded = 0;

  for (const img of images) {
    const sourcePath = path.join(imagesDir, img.filename);
    if (fs.existsSync(sourcePath)) {
      const success = await uploadFile(figuresPath, img.filename, sourcePath);
      if (success) uploaded++;
    } else {
      console.log(`  Warning: Image not found: ${img.filename}`);
    }
  }

  console.log(`  Uploaded ${uploaded}/${images.length} figures`);
  return uploaded;
}

async function main() {
  const { seSlug, targetSlug } = parseArgs();
  const bookPath = `books/${targetSlug}`;

  console.log(`🚀 Starting SE import: ${seSlug}`);
  console.log(`   SE Source: ${SE_BOOKS_DIR}/${seSlug}`);
  console.log(`   Target: ${bookPath}`);

  const seBookDir = path.join(SE_BOOKS_DIR, seSlug);
  if (!fs.existsSync(seBookDir)) {
    console.error(`SE book not found: ${seBookDir}`);
    process.exit(1);
  }

  console.log("\n=== Converting SE XHTML to HTML ===");
  const metadata = loadSEMetadata(seSlug);
  console.log(`  Title: ${metadata.title}`);
  console.log(`  Author: ${metadata.author}`);
  console.log(`  Language: ${metadata.language}`);

  // Convert with figures path pointing to the book's figures folder
  const figuresBasePath = `/${targetSlug}/figures`;
  const result = await convertSEBook(seSlug, { figuresBasePath });
  console.log(`  Converted ${result.lastChapter} chapters`);
  console.log(`  Found ${result.images.length} figures`);

  const characters = extractCharactersFromHtml(result.textHtml);
  console.log(`  Extracted ${characters.length} characters from play`);

  const chapters = splitHtmlIntoChapters(result.textHtml);

  const legacyAssetsDir = path.join(LEGACY_BOOKS_DIR, targetSlug, "assets");
  const hasLegacyAssets = fs.existsSync(legacyAssetsDir);
  if (hasLegacyAssets) {
    console.log(`  Found legacy assets at: ${legacyAssetsDir}`);
  }

  await step1_CreateFolderStructure(bookPath, metadata);
  const characterCount = await step2_ImportCharacters(bookPath, characters, hasLegacyAssets ? legacyAssetsDir : null);
  const chapterCount = await step3_ImportChapters(bookPath, chapters);
  const figureCount = await step4_ImportFigures(bookPath, seSlug, result.images);

  console.log("\n✅ Import complete!");
  console.log(`   Characters: ${characterCount}`);
  console.log(`   Chapters: ${chapterCount}`);
  console.log(`   Figures: ${figureCount}`);
  console.log(`\nNext steps:`);
  if (!hasLegacyAssets) {
    console.log(`   1. Generate character avatars in CMS`);
    console.log(`   2. Add background cues`);
  } else {
    console.log(`   1. Add background cues (character avatars imported from legacy assets)`);
  }
  console.log(`   ${hasLegacyAssets ? "2" : "3"}. Test in player: bun run dev:player`);
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
