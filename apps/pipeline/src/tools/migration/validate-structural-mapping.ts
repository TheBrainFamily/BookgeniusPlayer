/**
 * Validate that structural mapping (old index → first leaf) works for ALL existing cues.
 *
 * For each cue:
 * 1. Find the direct child at old index
 * 2. Find first leaf element inside it
 * 3. Report if no leaf found (edge case we need to handle)
 */

import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

const CONVEX_URL = process.env.CONVEX_URL || "https://willing-pig-943.convex.cloud";
const BOOKS_DIR = "/Users/lukaszgandecki/projects/bookgenius/frontend/ConvexAssets/books";

// Elements that are leaves (stop recursion)
const LEAF_ELEMENTS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "li", "dt", "dd", "td", "th",
  "figcaption", "figure", "hr", "span", "em", "strong"
]);

interface ValidationResult {
  bookPath: string;
  chapter: number;
  oldIndex: number;
  cueType: "background" | "music";
  cueFile: string;
  hasLeaf: boolean;
  firstLeafTag?: string;
  firstLeafText?: string;
  error?: string;
}

/**
 * Find first leaf element inside a container (or return element itself if it's a leaf)
 */
function findFirstLeaf($: cheerio.CheerioAPI, element: cheerio.Element): cheerio.Element | null {
  const $elem = $(element);
  const tag = element.tagName?.toLowerCase();

  // If this is a leaf, return it
  if (tag && LEAF_ELEMENTS.has(tag)) {
    const text = $elem.text().trim();
    // Only count as leaf if it has text content
    if (text.length > 0) {
      return element;
    }
  }

  // Otherwise, recursively find first leaf child
  const children = $elem.children().toArray();
  for (const child of children) {
    const leaf = findFirstLeaf($, child);
    if (leaf) return leaf;
  }

  return null;
}

async function validateBook(bookPath: string): Promise<ValidationResult[]> {
  const client = new ConvexHttpClient(CONVEX_URL);
  const results: ValidationResult[] = [];

  console.log(`\n📖 Validating ${bookPath}...`);

  // Get all cues for this book
  const cues = (await client.query("migration:getAllCuesForBook" as any, {
    bookPath,
  })) as {
    backgroundCues: Array<{ chapter: number; paragraph: number; fileBasename: string }>;
    musicCues: Array<{ chapter: number; paragraph: number; fileBasename: string }>;
  };

  const allCues = [
    ...cues.backgroundCues.map(c => ({ ...c, type: "background" as const })),
    ...cues.musicCues.map(c => ({ ...c, type: "music" as const })),
  ];

  console.log(`   Found ${allCues.length} cues`);

  // Group by chapter for efficiency
  const byChapter = new Map<number, typeof allCues>();
  for (const cue of allCues) {
    if (!byChapter.has(cue.chapter)) {
      byChapter.set(cue.chapter, []);
    }
    byChapter.get(cue.chapter)!.push(cue);
  }

  // Process each chapter
  for (const [chapter, chapterCues] of byChapter) {
    // Load chapter HTML
    const bookSlug = bookPath.replace("books/", "");
    const chapterPath = join(BOOKS_DIR, bookSlug, "chapters-source", `chapter-${chapter}.html`);

    let html: string;
    try {
      html = readFileSync(chapterPath, "utf-8");
    } catch (err) {
      console.log(`   ⚠️  Chapter ${chapter} file not found`);
      for (const cue of chapterCues) {
        results.push({
          bookPath,
          chapter,
          oldIndex: cue.paragraph,
          cueType: cue.type,
          cueFile: cue.fileBasename,
          hasLeaf: false,
          error: "Chapter file not found",
        });
      }
      continue;
    }

    const $ = cheerio.load(html);

    // Get direct children of section
    const directChildren = $(`[data-chapter="${chapter}"] > *`).toArray();

    // Validate each cue
    for (const cue of chapterCues) {
      const oldElement = directChildren[cue.paragraph];

      if (!oldElement) {
        results.push({
          bookPath,
          chapter,
          oldIndex: cue.paragraph,
          cueType: cue.type,
          cueFile: cue.fileBasename,
          hasLeaf: false,
          error: `No element at index ${cue.paragraph} (only ${directChildren.length} children)`,
        });
        continue;
      }

      // Try to find first leaf
      const firstLeaf = findFirstLeaf($, oldElement);

      if (firstLeaf) {
        const $leaf = $(firstLeaf);
        results.push({
          bookPath,
          chapter,
          oldIndex: cue.paragraph,
          cueType: cue.type,
          cueFile: cue.fileBasename,
          hasLeaf: true,
          firstLeafTag: firstLeaf.tagName?.toLowerCase(),
          firstLeafText: $leaf.text().trim().slice(0, 50),
        });
      } else {
        // No leaf found - this is the edge case!
        const $elem = $(oldElement);
        results.push({
          bookPath,
          chapter,
          oldIndex: cue.paragraph,
          cueType: cue.type,
          cueFile: cue.fileBasename,
          hasLeaf: false,
          error: `Element <${oldElement.tagName?.toLowerCase()}> has no leaf children (text: "${$elem.text().trim().slice(0, 50)}")`,
        });
      }
    }
  }

  return results;
}

async function validateAll() {
  const client = new ConvexHttpClient(CONVEX_URL);

  // Get all books with cues
  const books = (await client.query("migration:findBooksWithNonZeroParagraphCues" as any, {})) as Array<{
    bookPath: string;
    totalCues: number;
  }>;

  console.log(`🔍 Validating structural mapping for ${books.length} books...\n`);

  let totalCues = 0;
  let successfulMappings = 0;
  let failedMappings = 0;
  const failures: ValidationResult[] = [];
  const bookStats = new Map<string, { total: number; success: number; failed: number }>();

  for (const book of books) {
    const results = await validateBook(book.bookPath);
    totalCues += results.length;

    const stats = { total: 0, success: 0, failed: 0 };
    for (const result of results) {
      stats.total++;
      if (result.hasLeaf) {
        successfulMappings++;
        stats.success++;
      } else {
        failedMappings++;
        stats.failed++;
        failures.push(result);
      }
    }
    bookStats.set(book.bookPath, stats);
  }

  // Summary
  console.log(`\n${"=".repeat(80)}`);
  console.log(`PER-BOOK VALIDATION`);
  console.log(`${"=".repeat(80)}\n`);

  const cleanBooks: string[] = [];
  const brokenBooks: string[] = [];

  for (const [bookPath, stats] of bookStats) {
    const slug = bookPath.replace("books/", "");
    const successRate = ((stats.success / stats.total) * 100).toFixed(1);
    const status = stats.failed === 0 ? "✅" : "⚠️ ";

    console.log(`${status} ${slug.padEnd(50)} ${stats.success}/${stats.total} (${successRate}%)`);

    if (stats.failed === 0) {
      cleanBooks.push(slug);
    } else {
      brokenBooks.push(slug);
    }
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`OVERALL SUMMARY`);
  console.log(`${"=".repeat(80)}\n`);

  console.log(`Total cues validated: ${totalCues}`);
  console.log(`✅ Successful mappings: ${successfulMappings} (${((successfulMappings / totalCues) * 100).toFixed(1)}%)`);
  console.log(`❌ Failed mappings: ${failedMappings} (${((failedMappings / totalCues) * 100).toFixed(1)}%)\n`);

  console.log(`📚 Clean books (${cleanBooks.length}): ${cleanBooks.join(", ")}`);
  console.log(`⚠️  Broken books (${brokenBooks.length}): ${brokenBooks.join(", ")}\n`);

  if (failures.length > 0) {
    console.log(`${"=".repeat(80)}`);
    console.log(`FAILED MAPPINGS (${failures.length})`);
    console.log(`${"=".repeat(80)}\n`);

    for (const failure of failures.slice(0, 20)) {
      console.log(`📍 ${failure.bookPath} - Chapter ${failure.chapter}, Index ${failure.oldIndex}`);
      console.log(`   Cue: ${failure.cueFile} (${failure.cueType})`);
      console.log(`   Error: ${failure.error}\n`);
    }

    if (failures.length > 20) {
      console.log(`   ... and ${failures.length - 20} more failures\n`);
    }
  } else {
    console.log(`\n🎉 **ALL CUES CAN BE MAPPED STRUCTURALLY!**`);
    console.log(`\nStructural mapping is 100% viable. No content matching needed.\n`);
  }
}

validateAll()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
