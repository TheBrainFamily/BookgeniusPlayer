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
import { execSync } from "child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { parseHTML } from "linkedom";

// =============================================================================
// XML to HTML Conversion (Node-compatible version)
// =============================================================================

const STANDARD_TAGS = new Set([
  "p",
  "h3",
  "h4",
  "h5",
  "em",
  "strong",
  "br",
  "div",
  "blockquote",
  "note",
  "linebreak",
  "chapter",
  "span",
  "i",
  "b",
  "a",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "table",
  "tr",
  "td",
  "th",
  "thead",
  "tbody",
  "act",
  "title",
  "subtitle",
]);

function isCharacterTag(tagName: string): boolean {
  return !STANDARD_TAGS.has(tagName.toLowerCase()) && /^[A-Z]/.test(tagName);
}

function slugifyTagName(tagName: string): string {
  return tagName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function convertCharacterElement(el: Element): { html: string; speaker: string | null } {
  const slug = slugifyTagName(el.tagName);
  const isTalking = el.getAttribute("talking") === "true";
  const isEntering = el.getAttribute("enters") === "true";
  const isExiting = el.getAttribute("exits") === "true";
  const text = el.textContent || "";

  if (isTalking) {
    return { html: text, speaker: slug };
  }
  if (text.trim()) {
    const attrs = [`data-c="${slug}"`];
    if (isEntering) attrs.push('data-enters="true"');
    if (isExiting) attrs.push('data-exits="true"');
    return { html: `<span ${attrs.join(" ")}>${text}</span>`, speaker: null };
  }
  return { html: "", speaker: slug };
}

function convertNote(el: Element): string {
  const id = el.getAttribute("id") || "";
  const text = el.textContent?.trim() || `[${id}]`;
  return `<a data-note="${id}">${text}</a>`;
}

function convertPlayElement(el: Element): string {
  const text = el.textContent || "";
  switch (el.tagName.toLowerCase()) {
    case "act":
      return `<h3 class="act">${text}</h3>`;
    case "title":
      return `<h4 class="scene-title">${text}</h4>`;
    case "subtitle":
      return `<p class="scene-subtitle"><em>${text}</em></p>`;
    default:
      return `<div>${text}</div>`;
  }
}

function convertElement(el: Element): { html: string; speakers: string[] } {
  const tag = el.tagName.toLowerCase();

  if (isCharacterTag(el.tagName)) {
    const result = convertCharacterElement(el);
    return { html: result.html, speakers: result.speaker ? [result.speaker] : [] };
  }

  switch (tag) {
    case "note":
      return { html: convertNote(el), speakers: [] };
    case "linebreak":
    case "br":
      return { html: "<br>", speakers: [] };
    case "act":
    case "title":
    case "subtitle":
      return { html: convertPlayElement(el), speakers: [] };
    default:
      return convertStandardElement(el, tag);
  }
}

function convertStandardElement(el: Element, htmlTag: string): { html: string; speakers: string[] } {
  let inner = "";
  const speakers: string[] = [];

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      inner += node.textContent || "";
    } else if (node.nodeType === 1 /* ELEMENT_NODE */) {
      const converted = convertElement(node as Element);
      inner += converted.html;
      speakers.push(...converted.speakers);
    }
  }

  const attrs: string[] = [];
  if (speakers.length > 0) {
    attrs.push(`data-speaker="${speakers.join(" ")}"`);
  }
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === "id" || attr.name === "class") {
      attrs.push(`${attr.name}="${attr.value}"`);
    }
  }

  const attrStr = attrs.length ? " " + attrs.join(" ") : "";
  const validTag = STANDARD_TAGS.has(htmlTag) ? htmlTag : "div";

  return { html: `<${validTag}${attrStr}>${inner}</${validTag}>`, speakers: [] };
}

function convertXmlChapterToHtml(xml: string): string {
  // Use linkedom to parse XML as HTML (works for our simple XML structure)
  const { document } = parseHTML(`<html><body>${xml}</body></html>`);

  const chapter = document.querySelector("Chapter");
  if (!chapter) {
    throw new Error("No Chapter element found in XML");
  }

  const chapterId = chapter.getAttribute("id") || "1";
  let html = `<section data-chapter="${chapterId}">`;

  for (const child of Array.from(chapter.children) as Element[]) {
    const converted = convertElement(child);
    html += converted.html;
  }

  html += "</section>";
  return html;
}

function extractChapterMetadata(html: string): { chapterNumber: number; title: string | null; paragraphCount: number } {
  const { document } = parseHTML(html);
  const section = document.querySelector("section[data-chapter]");

  if (!section) {
    throw new Error("No section[data-chapter] found");
  }

  const chapterNumber = parseInt(section.getAttribute("data-chapter") || "1", 10);
  const titleEl = section.querySelector("h3, h4, h5");
  const title = titleEl?.textContent?.trim() || null;
  const paragraphCount = section.children.length;

  return { chapterNumber, title, paragraphCount };
}

// =============================================================================
// Types
// =============================================================================
// Types
// =============================================================================

// Legacy data types
type LegacyNote = { id: string; content: string };
type LegacyVariant = { id: string; analysis?: unknown; simplifications: { score: number; sentences: string[] }[] };
type LegacyBackground = { chapter: number; paragraph: number; file: string; backgroundColor: string; textColor: string };
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

const client = new ConvexHttpClient(CONVEX_URL);

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

  const book = { slug: slugMatch?.[1] || bookSlug, title: titleMatch[1], author: authorMatch[1], language: languageMatch[1], form: formMatch?.[1] };

  // Parse CharactersMaster - handles both attribute formats
  // Format 1: <Character-Name display="Display Name" summary="..." />
  // Format 2: <Character-Name display="Display Name" summary="..." aiPrompt="..." />
  // Note: summary can be empty (summary="")
  const characterRegex = /<([A-Za-z][A-Za-z0-9-]*)\s+display="([^"]+)"\s+summary="([^"]*)"(?:\s+aiPrompt="([^"]+)")?/g;
  const characters: { slug: string; displayName: string; summary: string; aiPrompt?: string }[] = [];

  let match;
  while ((match = characterRegex.exec(xmlContent)) !== null) {
    // Skip known non-character tags
    if (["BookMetadata", "CharactersMaster", "Slug", "Title", "Author", "Language", "Form", "VisualStyle"].includes(match[1])) {
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

function parseChapterTitle(xmlContent: string, chapterNum: number): string {
  // Try various title patterns
  const h3Match = xmlContent.match(/<h3>([^<]+)<\/h3>/);
  if (h3Match) return h3Match[1];

  const h4Match = xmlContent.match(/<h4>([^<]+)<\/h4>/);
  if (h4Match) return h4Match[1];

  const titleMatch = xmlContent.match(/<Title>([^<]+)<\/Title>/);
  if (titleMatch) return titleMatch[1];

  return `Chapter ${chapterNum}`;
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
    console.error(`  Failed to create folder ${folderPath}:`, error);
  }
}

async function uploadFile(folderPath: string, basename: string, filePath: string, extra?: object): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.log(`  Skipping (not found): ${filePath}`);
    return;
  }

  const file = fs.readFileSync(filePath);
  const contentType = getContentType(basename);

  try {
    const { intentId, uploadUrl, backend } = await client.mutation(api.generateUploadUrl.startUpload, { folderPath, basename, publish: true, extra });

    const response = await fetch(uploadUrl, { method: backend === "r2" ? "PUT" : "POST", headers: { "Content-Type": contentType }, body: file });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const uploadResponse = backend === "convex" ? await response.json() : undefined;

    await client.mutation(api.generateUploadUrl.finishUpload, { intentId, uploadResponse, size: file.length, contentType });

    console.log(`  Uploaded: ${folderPath}/${basename}`);
  } catch (error) {
    console.error(`  Failed to upload ${basename}:`, error);
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

async function step1_CreateFolderStructure(book: { title: string; author: string; language: string; form?: string }): Promise<void> {
  console.log("\n=== Step 1: Create Folder Structure ===");

  await createFolderIfNeeded("books");

  const bookExtra: BookFolderExtra = { type: "book", title: book.title, author: book.author, language: book.language, form: book.form };
  await createFolderIfNeeded(BOOK_PATH, bookExtra);

  await createFolderIfNeeded(`${BOOK_PATH}/characters`);
  await createFolderIfNeeded(`${BOOK_PATH}/chapters`);
  await createFolderIfNeeded(`${BOOK_PATH}/backgrounds`);
  await createFolderIfNeeded(`${BOOK_PATH}/music`);
}

async function step2_ImportCharacters(characters: { slug: string; displayName: string; summary: string; aiPrompt?: string }[]): Promise<number> {
  console.log("\n=== Step 2: Import Characters ===");

  await runInBatches(characters, async (char) => {
    console.log(`  Processing: ${char.displayName}`);

    const charPath = `${BOOK_PATH}/characters/${char.slug}`;
    const charExtra: CharacterFolderExtra = { type: "character", displayName: char.displayName, summary: char.summary, aiPrompt: char.aiPrompt };
    await createFolderIfNeeded(charPath, charExtra);

    const avatarExtensions = [".png", ".jpg", ".jpeg", ".webp"];
    let avatarUploaded = false;
    for (const ext of avatarExtensions) {
      const avatarFile = path.join(ASSETS_DIR, `${char.slug}${ext}`);
      if (fs.existsSync(avatarFile)) {
        await uploadFile(charPath, `avatar${ext}`, avatarFile);
        avatarUploaded = true;
        break;
      }
    }
    if (!avatarUploaded) {
      console.log(`    No avatar found for ${char.slug}`);
    }

    const speaksFile = path.join(ASSETS_DIR, `${char.slug}-speaks.mp4`);
    const listensFile = path.join(ASSETS_DIR, `${char.slug}-listens.mp4`);

    await Promise.all([uploadFile(charPath, "speaks.mp4", speaksFile), uploadFile(charPath, "listens.mp4", listensFile)]);
  });

  return characters.length;
}

async function step3_ImportChapters(book: { form?: string; language: string }): Promise<number> {
  const isPlayFormat = book.form === "Play" || book.form === "Mixed";

  if (isPlayFormat) {
    console.log("\n=== Step 3: Import Chapters (XML for plays - use migrate script after) ===");
    return step3_ImportChaptersAsXml();
  }

  console.log("\n=== Step 3: Import Chapters (HTML Source Format) ===");

  if (!fs.existsSync(CONTENT_DIR)) {
    console.log("  No booksContent directory found");
    return 0;
  }

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.startsWith("chapter") && f.endsWith(".xml"));
  files.sort((a, b) => {
    const numA = parseInt(a.match(/chapter(\d+)/)?.[1] || "0");
    const numB = parseInt(b.match(/chapter(\d+)/)?.[1] || "0");
    return numA - numB;
  });

  const chapters = files.map((file) => {
    const chapterNum = parseInt(file.match(/chapter(\d+)/)?.[1] || "0");
    const filePath = path.join(CONTENT_DIR, file);
    const xmlContent = fs.readFileSync(filePath, "utf-8");
    const htmlContent = convertXmlChapterToHtml(xmlContent);
    const metadata = extractChapterMetadata(htmlContent);
    return { chapterNum, htmlContent, metadata };
  });

  await runInBatches(chapters, async ({ chapterNum, htmlContent, metadata }) => {
    console.log(`  Chapter ${chapterNum}: ${metadata.title || "(no title)"} (${metadata.paragraphCount} paragraphs)`);
    await client.action(api.chapterCompiler.uploadHtmlSourceChapter, {
      bookPath: BOOK_PATH,
      chapterNumber: chapterNum,
      htmlContent,
      title: metadata.title || undefined,
      paragraphCount: metadata.paragraphCount,
    });
  });

  return files.length;
}

async function step3_ImportChaptersAsXml(): Promise<number> {
  const chaptersPath = `${BOOK_PATH}/chapters`;

  if (!fs.existsSync(CONTENT_DIR)) {
    console.log("  No booksContent directory found");
    return 0;
  }

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.startsWith("chapter") && f.endsWith(".xml"));
  files.sort((a, b) => {
    const numA = parseInt(a.match(/chapter(\d+)/)?.[1] || "0");
    const numB = parseInt(b.match(/chapter(\d+)/)?.[1] || "0");
    return numA - numB;
  });

  for (const file of files) {
    const chapterNum = parseInt(file.match(/chapter(\d+)/)?.[1] || "0");
    const filePath = path.join(CONTENT_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const title = parseChapterTitle(content, chapterNum);

    console.log(`  Chapter ${chapterNum}: ${title}`);

    const extra = { type: "chapter", chapterNumber: chapterNum, title };
    await uploadFile(chaptersPath, file, filePath, extra);
  }

  console.log("\n  🔄 Triggering chapter compilation...");
  try {
    console.log("__dirname", __dirname);
    execSync(`npx convex run chapterCompiler:recompileAllChapters '{"bookPath": "${BOOK_PATH}"}'`, { stdio: "inherit" });
    console.log("  ✅ Compilation complete");

    console.log("\n  🔄 Migrating to HTML source format...");
    execSync(`bun ./migrate-book-to-html.ts ${bookSlug}`, { stdio: "inherit", cwd: path.join(__dirname) });
    console.log("  ✅ Migration complete");
  } catch (error) {
    console.error("  ❌ Auto-compilation/migration failed:", error);
    console.log("\n  Manual steps:");
    console.log(`     npx convex run chapterCompiler:recompileAllChapters '{"bookPath": "${BOOK_PATH}"}'`);
    console.log(`     bun tools/scripts/migrate-book-to-html.ts ${bookSlug}`);
  }

  return files.length;
}

async function step4_ImportBackgrounds(): Promise<number> {
  console.log("\n=== Step 4: Import Backgrounds ===");

  const backgroundsPath = `${BOOK_PATH}/backgrounds`;

  // Try to load getBackgroundsForBook
  let backgrounds: LegacyBackground[] = [];
  try {
    const module = (await import(`../../../books/${bookSlug}/getBackgroundsForBook`)) as { getBackgroundsForBook: () => LegacyBackground[] };
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
  const cues = backgrounds
    .filter((bg) => uploadedFiles.has(bg.file))
    .map((bg) => ({
      bookPath: BOOK_PATH,
      fileBasename: bg.file,
      chapter: bg.chapter,
      paragraph: bg.paragraph,
      backgroundColor: bg.backgroundColor || undefined,
      textColor: bg.textColor || undefined,
    }));

  if (cues.length > 0) {
    await client.mutation(api.backgroundCues.bulkCreate, { cues });
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
    const module = (await import(`../../../books/${bookSlug}/getBackgroundSongsForBook`)) as { getBackgroundSongsForBook: () => LegacyMusic[] };
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
  const cues: { bookPath: string; fileBasename: string; chapter: number; paragraph: number }[] = [];

  for (const track of musicTracks) {
    for (const file of track.files) {
      const basename = path.basename(file);
      if (uploadedFiles.has(basename)) {
        cues.push({ bookPath: BOOK_PATH, fileBasename: basename, chapter: track.chapter, paragraph: track.paragraph });
      }
    }
  }

  if (cues.length > 0) {
    await client.mutation(api.musicCues.bulkCreate, { cues });
    console.log(`  Created ${cues.length} music cue points`);
  }

  return cues.length;
}

async function step6_ImportNotes(): Promise<number> {
  console.log("\n=== Step 6: Import Notes ===");

  // Load notes from legacy file
  let allNotes: LegacyNote[] = [];
  try {
    const module = (await import(`../../../books/${bookSlug}/getNotes`)) as { getNotes: () => LegacyNote[] };
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
  const notesToInsert: { bookPath: string; noteId: string; content: string; chapter: number }[] = [];

  const usedNoteIds = new Set<string>();

  if (fs.existsSync(CONTENT_DIR)) {
    const chapterFiles = fs.readdirSync(CONTENT_DIR).filter((f) => f.startsWith("chapter") && f.endsWith(".xml"));
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
          notesToInsert.push({ bookPath: BOOK_PATH, noteId: note.id, content: note.content, chapter: chapterNum });
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
    await client.mutation(api.notes.bulkCreate, { notes: notesToInsert });
    console.log(`  Imported ${notesToInsert.length} notes`);
  }

  return notesToInsert.length;
}

async function step7_ImportVariants(): Promise<number> {
  console.log("\n=== Step 7: Import Variants ===");

  // Load variants from legacy file
  let allVariants: LegacyVariant[] = [];
  try {
    const module = (await import(`../../../books/${bookSlug}/getAllVariants`)) as { getAllVariants: () => LegacyVariant[] };
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
  const variantsToInsert: { bookPath: string; variantId: string; chapter: number; simplifications: { score: number; sentences: string[] }[] }[] = [];

  for (const variant of allVariants) {
    // Extract chapter from ID: "ch1-p9-s1" -> 1
    const chapterMatch = variant.id.match(/^ch(\d+)/);
    const chapter = chapterMatch ? parseInt(chapterMatch[1], 10) : 0;

    variantsToInsert.push({
      bookPath: BOOK_PATH,
      variantId: variant.id,
      chapter,
      simplifications: variant.simplifications.map((s) => ({ score: s.score, sentences: s.sentences })),
    });
  }

  // Bulk insert in batches (variants can be large)
  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < variantsToInsert.length; i += BATCH_SIZE) {
    const batch = variantsToInsert.slice(i, i + BATCH_SIZE);
    await client.mutation(api.variants.bulkCreate, { variants: batch });
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

  // Run import steps
  await step1_CreateFolderStructure(book);
  const characterCount = await step2_ImportCharacters(characters);
  const chapterCount = await step3_ImportChapters(book);
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

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
