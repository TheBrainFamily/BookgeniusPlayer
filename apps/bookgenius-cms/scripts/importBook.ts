/**
 * Generic Book Import Script
 *
 * Imports a complete book from the legacy books folder into Convex CMS.
 * Includes: folder structure, characters, chapters, backgrounds, music, notes, variants.
 *
 * Usage:
 *   bun run scripts/importBook.ts <book-slug>
 *
 * Examples:
 *   bun run scripts/importBook.ts Lalka
 *   bun run scripts/importBook.ts Romeo-And-Juliet
 */

import * as fs from "fs";
import * as path from "path";
import { AdminConvexHttpClient } from "../lib/AdminConvexHttpClient";
import { api } from "@convex/_generated/api";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import {
  renderChapterFromXmlDocument,
  type CharacterBundleInfo,
} from "../../../apps/player/src/services/live/xmlRendererCore";
import { logError } from "../lib/utils";

// =============================================================================
// XML to HTML Conversion (using xmlRendererCore - same as chapterCompiler)
// =============================================================================

// Module-level character bundles (populated in main)
let globalCharacterBundles: CharacterBundleInfo[] = [];
let globalBookSlug = "";
let globalBookLang = "english";
let globalBookForm = "book";

function convertXmlChapterToHtml(
  xml: string,
  chapterNum: number,
): { html: string; title: string; paragraphCount: number } {
  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  // Normalize XML to have Chapter wrapper
  let normalizedXml = xml.trim();
  if (!normalizedXml.startsWith("<Chapter")) {
    normalizedXml = `<Chapter id="${chapterNum}">${normalizedXml}</Chapter>`;
  }

  const xmlDoc = parser.parseFromString(normalizedXml, "text/xml") as unknown as Document;
  const parseError = xmlDoc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent || "unknown error"}`);
  }

  const { html, title } = renderChapterFromXmlDocument(xmlDoc, {
    bookSlug: globalBookSlug,
    bookLang: globalBookLang,
    bookForm: globalBookForm,
    characterBundles: globalCharacterBundles,
    serializer,
  });

  // Count paragraphs by data-index attributes
  const paragraphCount = (html.match(/data-index="/g) ?? []).length;

  return { html, title, paragraphCount };
}

// =============================================================================
// Types
// =============================================================================
// Types
// =============================================================================

// Legacy data types
type LegacyNote = { id: string; content: string };
type LegacyVariant = {
  id: string;
  analysis?: unknown;
  simplifications: { score: number; sentences: string[] }[];
};
type LegacyBackground = {
  chapter: number;
  paragraph: number;
  file: string;
  backgroundColor: string;
  textColor: string;
};
type LegacyMusic = { chapter: number; paragraph: number; files: string[] };

// CMS Extra types
interface BookFolderExtra {
  type: "book";
  title: string;
  author: string;
  language: string;
  form?: string;
}

interface CharacterFolderExtra {
  type: "character";
  displayName: string;
  summary: string;
  aiPrompt?: string;
}

// Note: Background and music cue points are now stored in separate tables
// (backgroundCues, musicCues) rather than as file extra metadata.

const CONCURRENCY = 10;

async function runInBatches<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// =============================================================================
// Configuration
// =============================================================================

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("Missing CONVEX_URL environment variable");
  process.exit(1);
}

const client = new AdminConvexHttpClient(CONVEX_URL);

// Get book slug from command line
const bookSlug = process.argv[2];
if (!bookSlug) {
  console.error("Usage: bun run scripts/importBook.ts <book-slug>");
  console.error("Example: bun run scripts/importBook.ts Lalka");
  process.exit(1);
}

// Paths
const BOOK_ROOT = path.join(__dirname, `../../../books/${bookSlug}`);
const ASSETS_DIR = path.join(BOOK_ROOT, "assets");
const CONTENT_DIR = path.join(BOOK_ROOT, "booksContent");
const BOOK_PATH = `books/${bookSlug}`;

// Verify book exists
if (!fs.existsSync(BOOK_ROOT)) {
  console.error(`Book not found: ${BOOK_ROOT}`);
  process.exit(1);
}

// =============================================================================
// XML Parsing
// =============================================================================

function parseMetadataXml(xmlContent: string): {
  book: { slug: string; title: string; author: string; language: string; form?: string };
  characters: { slug: string; displayName: string; summary: string; aiPrompt?: string }[];
} {
  // Parse BookMetadata
  const slugMatch = xmlContent.match(/<Slug>([^<]+)<\/Slug>/);
  const titleMatch = xmlContent.match(/<Title>([^<]+)<\/Title>/);
  const authorMatch = xmlContent.match(/<Author>([^<]+)<\/Author>/);
  const languageMatch = xmlContent.match(/<Language>([^<]+)<\/Language>/);
  const formMatch = xmlContent.match(/<Form>([^<]+)<\/Form>/);

  if (!titleMatch?.[1]) {
    throw new Error("Missing <Title> in metadata.xml");
  }
  if (!authorMatch?.[1]) {
    throw new Error("Missing <Author> in metadata.xml");
  }
  if (!languageMatch?.[1]) {
    throw new Error("Missing <Language> in metadata.xml");
  }

  const book = {
    slug: slugMatch?.[1] || bookSlug,
    title: titleMatch[1],
    author: authorMatch[1],
    language: languageMatch[1],
    form: formMatch?.[1],
  };

  // Parse CharactersMaster - handles both attribute formats
  // Format 1: <Character-Name display="Display Name" summary="..." />
  // Format 2: <Character-Name display="Display Name" summary="..." aiPrompt="..." />
  // Note: summary can be empty (summary="")
  const characterRegex =
    /<([A-Za-z][A-Za-z0-9-]*)\s+display="([^"]+)"\s+summary="([^"]*)"(?:\s+aiPrompt="([^"]+)")?/g;
  const characters: { slug: string; displayName: string; summary: string; aiPrompt?: string }[] =
    [];

  let match;
  while ((match = characterRegex.exec(xmlContent)) !== null) {
    // Skip known non-character tags
    if (
      [
        "BookMetadata",
        "CharactersMaster",
        "Slug",
        "Title",
        "Author",
        "Language",
        "Form",
        "VisualStyle",
      ].includes(match[1])
    ) {
      continue;
    }
    characters.push({
      slug: match[1].toLowerCase(),
      displayName: match[2],
      summary: match[3].replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
      aiPrompt: match[4]?.replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
    });
  }

  return { book, characters };
}

function findNoteReferencesInChapter(xmlContent: string): string[] {
  // Find all <note id='X'> or <note id="X"> tags
  const regex = /<note\s+id=['"](\d+)['"]/g;
  const noteIds: string[] = [];
  let match;
  while ((match = regex.exec(xmlContent)) !== null) {
    noteIds.push(`fn${match[1]}`);
  }
  return noteIds;
}

// =============================================================================
// Convex Operations
// =============================================================================

async function createFolderIfNeeded(folderPath: string, extra?: object): Promise<void> {
  try {
    const existing = await client.query(api.cli.getFolder, { path: folderPath });
    if (existing) {
      console.log(`  Folder exists: ${folderPath}`);
      return;
    }
  } catch {
    // Folder doesn't exist, create it
  }

  try {
    await client.mutation(api.cli.createFolderByPath, { path: folderPath, extra });
    console.log(`  Created folder: ${folderPath}`);
  } catch (error) {
    logError(`  Failed to create folder ${folderPath}:`, error);
  }
}

async function uploadFile(
  folderPath: string,
  basename: string,
  filePath: string,
  extra?: object,
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.log(`  Skipping (not found): ${filePath}`);
    return;
  }

  const file = fs.readFileSync(filePath);
  const contentType = getContentType(basename);

  try {
    const { intentId, uploadUrl, backend } = await client.mutation(
      api.generateUploadUrl.startUpload,
      { folderPath, basename, publish: true, extra },
    );

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
  } catch (error) {
    logError(`  Failed to upload ${basename}:`, error);
  }
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".xml": "application/xml",
    ".json": "application/json",
  };
  return types[ext] || "application/octet-stream";
}

// =============================================================================
// Import Steps
// =============================================================================

async function step1_CreateFolderStructure(book: {
  title: string;
  author: string;
  language: string;
  form?: string;
}): Promise<void> {
  console.log("\n=== Step 1: Create Folder Structure ===");

  await createFolderIfNeeded("books");

  const bookExtra: BookFolderExtra = {
    type: "book",
    title: book.title,
    author: book.author,
    language: book.language,
    form: book.form,
  };
  await createFolderIfNeeded(BOOK_PATH, bookExtra);

  await createFolderIfNeeded(`${BOOK_PATH}/characters`);
  await createFolderIfNeeded(`${BOOK_PATH}/chapters`);
  await createFolderIfNeeded(`${BOOK_PATH}/backgrounds`);
  await createFolderIfNeeded(`${BOOK_PATH}/music`);
}

async function step2_ImportCharacters(
  characters: { slug: string; displayName: string; summary: string; aiPrompt?: string }[],
): Promise<number> {
  console.log("\n=== Step 2: Import Characters ===");

  await runInBatches(characters, async (char) => {
    console.log(`  Processing: ${char.displayName}`);

    const charPath = `${BOOK_PATH}/characters/${char.slug}`;
    const charExtra: CharacterFolderExtra = {
      type: "character",
      displayName: char.displayName,
      summary: char.summary,
      aiPrompt: char.aiPrompt,
    };
    await createFolderIfNeeded(charPath, charExtra);

    const avatarExtensions = [".png", ".jpg", ".jpeg", ".webp"];
    let avatarUploaded = false;
    for (const ext of avatarExtensions) {
      const avatarFile = path.join(ASSETS_DIR, `${char.slug}${ext}`);
      if (fs.existsSync(avatarFile)) {
        await uploadFile(charPath, `avatar-large${ext}`, avatarFile);
        avatarUploaded = true;
        break;
      }
    }
    if (!avatarUploaded) {
      console.log(`    No avatar found for ${char.slug}`);
    }

    const speaksFile = path.join(ASSETS_DIR, `${char.slug}-speaks.mp4`);
    const listensFile = path.join(ASSETS_DIR, `${char.slug}-listens.mp4`);

    await Promise.all([
      uploadFile(charPath, "speaks.mp4", speaksFile),
      uploadFile(charPath, "listens.mp4", listensFile),
    ]);
  });

  return characters.length;
}

// Uses xmlRendererCore.renderChapterFromXmlDocument for proper play/prose formatting
async function step3_ImportChapters(): Promise<number> {
  console.log("\n=== Step 3: Import Chapters (HTML Source Format) ===");

  if (!fs.existsSync(CONTENT_DIR)) {
    console.log("  No booksContent directory found");
    return 0;
  }

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.startsWith("chapter") && f.endsWith(".xml"));
  files.sort((a, b) => {
    const numA = parseInt(a.match(/chapter(\d+)/)?.[1] || "0");
    const numB = parseInt(b.match(/chapter(\d+)/)?.[1] || "0");
    return numA - numB;
  });

  const chapters = files.map((file) => {
    const chapterNum = parseInt(file.match(/chapter(\d+)/)?.[1] || "0");
    const filePath = path.join(CONTENT_DIR, file);
    const xmlContent = fs.readFileSync(filePath, "utf-8");
    const { html, title, paragraphCount } = convertXmlChapterToHtml(xmlContent, chapterNum);
    return { chapterNum, htmlContent: html, title, paragraphCount };
  });

  await runInBatches(chapters, async ({ chapterNum, htmlContent, title, paragraphCount }) => {
    console.log(`  Chapter ${chapterNum}: ${title || "(no title)"} (${paragraphCount} paragraphs)`);
    await client.action(api.chapterCompiler.uploadHtmlSourceChapter, {
      bookPath: BOOK_PATH,
      chapterNumber: chapterNum,
      htmlContent,
      title: title || undefined,
      paragraphCount,
    });
  });

  return files.length;
}

async function step4_ImportBackgrounds(): Promise<number> {
  console.log("\n=== Step 4: Import Backgrounds ===");

  const backgroundsPath = `${BOOK_PATH}/backgrounds`;

  // Try to load getBackgroundsForBook
  let backgrounds: LegacyBackground[] = [];
  try {
    const module = (await import(`../../../books/${bookSlug}/getBackgroundsForBook`)) as {
      getBackgroundsForBook: () => LegacyBackground[];
    };
    backgrounds = module.getBackgroundsForBook();
  } catch {
    console.log("  No getBackgroundsForBook.ts found (skipping)");
    return 0;
  }

  console.log(`  Found ${backgrounds.length} background entries`);

  const uniqueFiles = [...new Set(backgrounds.map((bg) => bg.file))];
  const existingFiles = uniqueFiles.filter((file) => {
    const filePath = path.join(ASSETS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  Skipping (not found): ${file}`);
      return false;
    }
    return true;
  });

  await runInBatches(existingFiles, async (file) => {
    await uploadFile(backgroundsPath, file, path.join(ASSETS_DIR, file));
  });

  const uploadedFiles = new Set(existingFiles);
  console.log(`  Uploaded ${uploadedFiles.size} unique background files`);

  // Step 2: Create cue points for ALL entries (supports reuse)
  // Note: bookPath is passed at top level, not in each cue (bookMutation extracts it)
  const cues = backgrounds
    .filter((bg) => uploadedFiles.has(bg.file))
    .map((bg) => ({
      fileBasename: bg.file,
      chapter: bg.chapter,
      paragraph: bg.paragraph,
      backgroundColor: bg.backgroundColor || undefined,
      textColor: bg.textColor || undefined,
    }));

  if (cues.length > 0) {
    await client.mutation(api.backgroundCues.bulkCreate, { bookPath: BOOK_PATH, cues });
    console.log(`  Created ${cues.length} background cue points`);
  }

  return cues.length;
}

async function step5_ImportMusic(): Promise<number> {
  console.log("\n=== Step 5: Import Music ===");

  const musicPath = `${BOOK_PATH}/music`;

  // Try to load getBackgroundSongsForBook
  let musicTracks: LegacyMusic[] = [];
  try {
    const module = (await import(`../../../books/${bookSlug}/getBackgroundSongsForBook`)) as {
      getBackgroundSongsForBook: () => LegacyMusic[];
    };
    musicTracks = module.getBackgroundSongsForBook();
  } catch {
    console.log("  No getBackgroundSongsForBook.ts found (skipping)");
    return 0;
  }

  console.log(`  Found ${musicTracks.length} music entries`);

  const allFiles = musicTracks.flatMap((track) => track.files);
  const uniqueFilesMap = new Map<string, string>();
  for (const file of allFiles) {
    const basename = path.basename(file);
    if (!uniqueFilesMap.has(basename)) {
      uniqueFilesMap.set(basename, file);
    }
  }

  const existingFiles: { basename: string; fullPath: string }[] = [];
  for (const [basename, file] of uniqueFilesMap) {
    const filePath = path.join(ASSETS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  Skipping (not found): ${file}`);
      continue;
    }
    existingFiles.push({ basename, fullPath: filePath });
  }

  await runInBatches(existingFiles, async ({ basename, fullPath }) => {
    await uploadFile(musicPath, basename, fullPath);
  });

  const uploadedFiles = new Set(existingFiles.map((f) => f.basename));
  console.log(`  Uploaded ${uploadedFiles.size} unique music files`);

  // Step 2: Create cue points for ALL entries (supports reuse)
  // Each track entry can have multiple files, create one cue per file
  // Note: bookPath is passed at top level, not in each cue (bookMutation extracts it)
  const cues: { fileBasename: string; chapter: number; paragraph: number }[] = [];

  for (const track of musicTracks) {
    for (const file of track.files) {
      const basename = path.basename(file);
      if (uploadedFiles.has(basename)) {
        cues.push({ fileBasename: basename, chapter: track.chapter, paragraph: track.paragraph });
      }
    }
  }

  if (cues.length > 0) {
    await client.mutation(api.musicCues.bulkCreate, { bookPath: BOOK_PATH, cues });
    console.log(`  Created ${cues.length} music cue points`);
  }

  return cues.length;
}

async function step6_ImportNotes(): Promise<number> {
  console.log("\n=== Step 6: Import Notes ===");

  // Load notes from legacy file
  let allNotes: LegacyNote[] = [];
  try {
    const module = (await import(`../../../books/${bookSlug}/getNotes`)) as {
      getNotes: () => LegacyNote[];
    };
    allNotes = module.getNotes();
  } catch {
    console.log("  No getNotes.ts found (skipping)");
    return 0;
  }

  if (allNotes.length === 0) {
    console.log("  No notes to import");
    return 0;
  }

  console.log(`  Found ${allNotes.length} notes in getNotes.ts`);

  // Build note lookup map
  const noteMap = new Map<string, LegacyNote>();
  for (const note of allNotes) {
    noteMap.set(note.id, note);
  }

  // Scan chapters for note references
  // Note: bookPath is passed at top level, not in each note (bookMutation extracts it)
  const notesToInsert: { noteId: string; content: string; chapter: number }[] = [];

  const usedNoteIds = new Set<string>();

  if (fs.existsSync(CONTENT_DIR)) {
    const chapterFiles = fs
      .readdirSync(CONTENT_DIR)
      .filter((f) => f.startsWith("chapter") && f.endsWith(".xml"));
    chapterFiles.sort((a, b) => {
      const numA = parseInt(a.match(/chapter(\d+)/)?.[1] || "0");
      const numB = parseInt(b.match(/chapter(\d+)/)?.[1] || "0");
      return numA - numB;
    });

    console.log(`  Scanning ${chapterFiles.length} chapters for note references...`);

    for (const file of chapterFiles) {
      const chapterNum = parseInt(file.match(/chapter(\d+)/)?.[1] || "0");
      const filePath = path.join(CONTENT_DIR, file);
      const content = fs.readFileSync(filePath, "utf-8");

      const noteIds = findNoteReferencesInChapter(content);
      for (const noteId of noteIds) {
        const note = noteMap.get(noteId);
        if (note && !usedNoteIds.has(noteId)) {
          notesToInsert.push({ noteId: note.id, content: note.content, chapter: chapterNum });
          usedNoteIds.add(noteId);
        }
      }
    }
  }

  // Report orphaned notes
  const orphanedNotes = allNotes.filter((n) => !usedNoteIds.has(n.id));
  if (orphanedNotes.length > 0) {
    console.log(`  Warning: ${orphanedNotes.length} notes not referenced in any chapter:`);
    console.log(
      `    ${orphanedNotes
        .slice(0, 5)
        .map((n) => n.id)
        .join(", ")}${orphanedNotes.length > 5 ? "..." : ""}`,
    );
  }

  // Bulk insert notes
  if (notesToInsert.length > 0) {
    console.log(`  Inserting ${notesToInsert.length} notes...`);
    await client.mutation(api.notes.bulkCreate, { bookPath: BOOK_PATH, notes: notesToInsert });
    console.log(`  Imported ${notesToInsert.length} notes`);
  }

  return notesToInsert.length;
}

async function step7_ImportVariants(): Promise<number> {
  console.log("\n=== Step 7: Import Variants ===");

  // Load variants from legacy file
  let allVariants: LegacyVariant[] = [];
  try {
    const module = (await import(`../../../books/${bookSlug}/getAllVariants`)) as {
      getAllVariants: () => LegacyVariant[];
    };
    allVariants = module.getAllVariants();
  } catch {
    console.log("  No getAllVariants.ts found (skipping)");
    return 0;
  }

  if (allVariants.length === 0) {
    console.log("  No variants to import");
    return 0;
  }

  console.log(`  Found ${allVariants.length} variants in getAllVariants.ts`);

  // Transform and prepare for insertion
  const variantsToInsert: {
    bookPath: string;
    variantId: string;
    chapter: number;
    simplifications: { score: number; sentences: string[] }[];
  }[] = [];

  for (const variant of allVariants) {
    // Extract chapter from ID: "ch1-p9-s1" -> 1
    const chapterMatch = variant.id.match(/^ch(\d+)/);
    const chapter = chapterMatch ? parseInt(chapterMatch[1], 10) : 0;

    variantsToInsert.push({
      bookPath: BOOK_PATH,
      variantId: variant.id,
      chapter,
      simplifications: variant.simplifications.map((s) => ({
        score: s.score,
        sentences: s.sentences,
      })),
    });
  }

  // Bulk insert in batches (variants can be large)
  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < variantsToInsert.length; i += BATCH_SIZE) {
    const batch = variantsToInsert.slice(i, i + BATCH_SIZE);
    // bookPath is extracted by bookMutation wrapper, variants don't include it
    const variantsWithoutBookPath = batch.map(({ bookPath: _, ...rest }) => rest);
    await client.mutation(api.variants.bulkCreate, {
      bookPath: BOOK_PATH,
      variants: variantsWithoutBookPath,
    });
    inserted += batch.length;
    console.log(`  Inserted ${inserted}/${variantsToInsert.length} variants...`);
  }

  console.log(`  Imported ${variantsToInsert.length} variants`);
  return variantsToInsert.length;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log(`🚀 Starting import: ${bookSlug}`);
  console.log(`   Source: ${BOOK_ROOT}`);
  console.log(`   Target: ${BOOK_PATH}`);

  // Parse metadata (required)
  const metadataPath = path.join(CONTENT_DIR, "metadata.xml");
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Missing required file: ${metadataPath}`);
  }

  const metadataContent = fs.readFileSync(metadataPath, "utf-8");
  const { book, characters } = parseMetadataXml(metadataContent);

  console.log(`\nParsed metadata:`);
  console.log(`  Title: ${book.title}`);
  console.log(`  Author: ${book.author}`);
  console.log(`  Language: ${book.language}`);
  console.log(`  Form: ${book.form || "(not set)"}`);
  console.log(`  Characters: ${characters.length}`);

  // Set up global state for XML→HTML conversion
  globalBookSlug = book.slug || bookSlug;
  globalBookLang = book.language.toLowerCase();
  globalBookForm = (book.form || "book").toLowerCase();
  globalCharacterBundles = characters.map((c) => ({
    slug: c.slug,
    name: c.displayName,
    extra: { displayName: c.displayName, summary: c.summary },
  }));

  // Run import steps
  await step1_CreateFolderStructure(book);
  const characterCount = await step2_ImportCharacters(characters);
  await step2b_GenerateAvatarWebps();
  const chapterCount = await step3_ImportChapters();
  const backgroundCount = await step4_ImportBackgrounds();
  const musicCount = await step5_ImportMusic();
  const noteCount = await step6_ImportNotes();
  const variantCount = await step7_ImportVariants();

  console.log("\n✅ Import complete!");
  console.log(`   Characters: ${characterCount}`);
  console.log(`   Chapters: ${chapterCount}`);
  console.log(`   Backgrounds: ${backgroundCount}`);
  console.log(`   Music: ${musicCount}`);
  console.log(`   Notes: ${noteCount}`);
  console.log(`   Variants: ${variantCount}`);
}

async function step2b_GenerateAvatarWebps(): Promise<void> {
  console.log("\n=== Step 2b: Generate Avatar WebPs ===");

  // Run up to 5 times to catch transient failures from Cloudflare worker memory limits
  const MAX_PASSES = 5;
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    console.log(`  Pass ${pass}/${MAX_PASSES}...`);
    try {
      const result = await client.action(api.avatarGeneration.repairAvatarsForBook, {
        bookPath: BOOK_PATH,
      });

      console.log(`    Repaired: ${result.repaired.length}`);
      console.log(`    Skipped: ${result.skipped.length}`);
      if (result.failed.length > 0) {
        console.log(`    Failed: ${result.failed.length}`);
        if (pass === MAX_PASSES) {
          result.failed.forEach((f) => console.log(`      - ${f}`));
        }
      }

      // If nothing left to repair, we're done
      if (result.repaired.length === 0 && result.failed.length === 0) {
        console.log(`  All avatars processed.`);
        break;
      }
      // If no failures, we're done
      if (result.failed.length === 0) {
        console.log(`  All avatars processed successfully.`);
        break;
      }
    } catch (error) {
      logError(`  Pass ${pass} failed:`, error);
      if (pass === MAX_PASSES) {
        console.log("  (Continuing with import - avatars can be regenerated later)");
      }
    }
  }
}

main().catch((error) => {
  logError("Import failed:", error);
  process.exit(1);
});
