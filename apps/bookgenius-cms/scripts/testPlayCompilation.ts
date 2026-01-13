/**
 * Test script to preview XML→HTML compilation using the same logic as chapterCompiler.
 * Uses xmlRendererCore.renderChapterFromXmlDocument for proper play formatting.
 *
 * Usage: bun run scripts/testPlayCompilation.ts <book-slug>
 */

import * as fs from "fs";
import * as path from "path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import {
  renderChapterFromXmlDocument,
  type CharacterBundleInfo,
} from "../../../apps/player/src/services/live/xmlRendererCore";

// =============================================================================
// XML Metadata Parsing
// =============================================================================

function parseMetadataXml(xmlContent: string): {
  book: { slug: string; title: string; author: string; language: string; form?: string };
  characters: { slug: string; displayName: string; summary: string; aiPrompt?: string }[];
} {
  const slugMatch = xmlContent.match(/<Slug>([^<]+)<\/Slug>/);
  const titleMatch = xmlContent.match(/<Title>([^<]+)<\/Title>/);
  const authorMatch = xmlContent.match(/<Author>([^<]+)<\/Author>/);
  const languageMatch = xmlContent.match(/<Language>([^<]+)<\/Language>/);
  const formMatch = xmlContent.match(/<Form>([^<]+)<\/Form>/);

  if (!titleMatch?.[1]) {
    throw new Error("Missing <Title> in metadata.xml");
  }

  const book = {
    slug: slugMatch?.[1] || "",
    title: titleMatch[1],
    author: authorMatch?.[1] || "",
    language: languageMatch?.[1] || "english",
    form: formMatch?.[1],
  };

  const characterRegex =
    /<([A-Za-z][A-Za-z0-9-]*)\s+display="([^"]+)"\s+summary="([^"]*)"(?:\s+aiPrompt="([^"]+)")?/g;
  const characters: { slug: string; displayName: string; summary: string; aiPrompt?: string }[] =
    [];

  let match;
  while ((match = characterRegex.exec(xmlContent)) !== null) {
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

// =============================================================================
// Main
// =============================================================================

const bookSlug = process.argv[2];
if (!bookSlug) {
  console.error("Usage: bun run scripts/testPlayCompilation.ts <book-slug>");
  process.exit(1);
}

const BOOK_ROOT = path.join(__dirname, `../../../books/${bookSlug}`);
const CONTENT_DIR = path.join(BOOK_ROOT, "booksContent");
const OUTPUT_DIR = path.join(__dirname, `../../../temp-compilation/${bookSlug}`);

if (!fs.existsSync(BOOK_ROOT)) {
  console.error(`Book not found: ${BOOK_ROOT}`);
  process.exit(1);
}

if (!fs.existsSync(CONTENT_DIR)) {
  console.error(`No booksContent directory: ${CONTENT_DIR}`);
  process.exit(1);
}

// Parse metadata to get book info and characters
const metadataPath = path.join(CONTENT_DIR, "metadata.xml");
if (!fs.existsSync(metadataPath)) {
  console.error(`No metadata.xml: ${metadataPath}`);
  process.exit(1);
}

const metadataContent = fs.readFileSync(metadataPath, "utf-8");
const { book, characters } = parseMetadataXml(metadataContent);

console.log(`Book: ${book.title}`);
console.log(`Form: ${book.form || "(not set)"}`);
console.log(`Language: ${book.language}`);
console.log(`Characters: ${characters.length}`);

// Build character bundles in the format xmlRendererCore expects
const characterBundles: CharacterBundleInfo[] = characters.map((c) => ({
  slug: c.slug,
  name: c.displayName,
  metadata: { displayName: c.displayName, summary: c.summary },
}));

// Create output directory
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Find chapter files
const files = fs
  .readdirSync(CONTENT_DIR)
  .filter((f) => f.startsWith("chapter") && f.endsWith(".xml"));
files.sort((a, b) => {
  const numA = parseInt(a.match(/chapter(\d+)/)?.[1] || "0");
  const numB = parseInt(b.match(/chapter(\d+)/)?.[1] || "0");
  return numA - numB;
});

console.log(`\nCompiling ${files.length} chapters...`);
console.log(`Output: ${OUTPUT_DIR}\n`);

const serializer = new XMLSerializer();
const parser = new DOMParser();

for (const file of files) {
  const chapterNum = parseInt(file.match(/chapter(\d+)/)?.[1] || "0");
  const filePath = path.join(CONTENT_DIR, file);
  const xmlContent = fs.readFileSync(filePath, "utf-8");

  try {
    // Normalize XML to have Chapter wrapper
    let normalizedXml = xmlContent.trim();
    if (!normalizedXml.startsWith("<Chapter")) {
      normalizedXml = `<Chapter id="${chapterNum}">${normalizedXml}</Chapter>`;
    }

    // Parse and render using xmlRendererCore (same as chapterCompiler)
    const xmlDoc = parser.parseFromString(normalizedXml, "text/xml") as unknown as Document;
    const parseError = xmlDoc.getElementsByTagName("parsererror")[0];
    if (parseError) {
      throw new Error(`XML parse error: ${parseError.textContent || "unknown error"}`);
    }

    const { html, title, chapterId } = renderChapterFromXmlDocument(xmlDoc, {
      bookSlug: book.slug || bookSlug,
      bookLang: book.language.toLowerCase(),
      bookForm: (book.form || "book").toLowerCase(),
      characterBundles,
      serializer,
    });

    // Write output
    const outputFile = path.join(OUTPUT_DIR, `chapter-${chapterNum}.html`);
    fs.writeFileSync(outputFile, html, "utf-8");

    console.log(`  ✓ Chapter ${chapterNum} (id: ${chapterId}, title: "${title || "-"}")`);
  } catch (error) {
    console.error(`  ✗ Chapter ${chapterNum} failed:`, error);
  }
}

console.log(`\nDone! Check ${OUTPUT_DIR} for compiled HTML files.`);
