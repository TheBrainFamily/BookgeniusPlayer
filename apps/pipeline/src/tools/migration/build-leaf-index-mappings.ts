/**
 * Build old→new index mappings for the recursive leaf-element indexing migration.
 *
 * For each book with cues, computes:
 *   - OLD indices (direct children, current system)
 *   - NEW indices (recursive leaf extraction)
 *   - Mapping: oldIndex → newIndex (first leaf descendant of the same direct-child ancestor)
 *
 * Usage:
 *   bun build-leaf-index-mappings.ts [bookSlug]     # one book
 *   bun build-leaf-index-mappings.ts --all           # all books with cues
 */

import { ConvexHttpClient } from "convex/browser";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";
import { extractLeafElements, extractDirectChildren } from "./leaf-extraction";

const CONVEX_URL = process.env.CONVEX_URL || "https://willing-pig-943.convex.cloud";
const NEW_FORMAT_DIR = "/Users/lukaszgandecki/projects/bookgenius/frontend/ConvexAssets/books";
const OUTPUT_DIR =
  "/Users/lukaszgandecki/projects/bookgenius/frontend/apps/pipeline/src/tools/migration/mappings";

interface IndexMapping {
  oldIndex: number;
  newIndex: number;
  oldText: string;
  newText: string;
  tag: string;
  /** true if content expanded (blockquote → multiple leaves) */
  expanded: boolean;
}

interface ChapterMapping {
  chapter: number;
  oldCount: number;
  newCount: number;
  diff: number;
  mappings: IndexMapping[];
}

interface BookMapping {
  book: string;
  chapters: ChapterMapping[];
  totalOld: number;
  totalNew: number;
  affectedChapters: number;
  cuesMapped: number;
  cuesTotal: number;
}

function buildChapterMapping($: cheerio.CheerioAPI, chapterNum: number): ChapterMapping {
  const oldElements = extractDirectChildren($, chapterNum);
  const newElements = extractLeafElements($, chapterNum);

  const mappings: IndexMapping[] = [];

  // Strategy: walk both lists using cumulative shift tracking.
  // Non-expanded elements: oldIndex + shift → newIndex (1:1 mapping)
  // Expanded containers: oldIndex + shift → first leaf; shift increases by (numLeaves - 1)
  //
  // Group new elements by directChildIndex to detect expansions.
  const newByAncestor = new Map<number, typeof newElements>();
  for (const el of newElements) {
    const group = newByAncestor.get(el.directChildIndex) ?? [];
    group.push(el);
    newByAncestor.set(el.directChildIndex, group);
  }

  // Track which directChildIndex we've seen and position within group
  const positionInGroup = new Map<number, number>();

  for (const oldEl of oldElements) {
    const group = newByAncestor.get(oldEl.directChildIndex);
    if (!group || group.length === 0) continue;

    const pos = positionInGroup.get(oldEl.directChildIndex) ?? 0;
    const newEl = group[Math.min(pos, group.length - 1)];
    positionInGroup.set(oldEl.directChildIndex, pos + 1);

    // An element is "expanded" if it's a container whose group has more new leaves
    // than old elements from the same ancestor
    const oldCountInAncestor = oldElements.filter(
      (o) => o.directChildIndex === oldEl.directChildIndex,
    ).length;
    const expanded = group.length > oldCountInAncestor;

    mappings.push({
      oldIndex: oldEl.index,
      newIndex: newEl.index,
      oldText: oldEl.text.slice(0, 80),
      newText: newEl.text.slice(0, 80),
      tag: oldEl.tag,
      expanded,
    });
  }

  return {
    chapter: chapterNum,
    oldCount: oldElements.length,
    newCount: newElements.length,
    diff: newElements.length - oldElements.length,
    mappings,
  };
}

async function buildBookMapping(bookSlug: string): Promise<BookMapping> {
  const client = new ConvexHttpClient(CONVEX_URL);

  // Get cues
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cues = (await client.query("migration:getAllCuesForBook" as any, {
    bookPath: `books/${bookSlug}`,
  })) as {
    backgroundCues: Array<{ chapter: number; paragraph: number; fileBasename: string }>;
    musicCues: Array<{ chapter: number; paragraph: number; fileBasename: string }>;
  };

  const allCues = [...cues.backgroundCues, ...cues.musicCues];
  const chaptersWithCues = new Set(allCues.map((c) => c.chapter));

  // Find all chapter files
  const chapterDir = join(NEW_FORMAT_DIR, bookSlug, "chapters-source");
  if (!existsSync(chapterDir)) {
    return {
      book: bookSlug,
      chapters: [],
      totalOld: 0,
      totalNew: 0,
      affectedChapters: 0,
      cuesMapped: 0,
      cuesTotal: allCues.length,
    };
  }

  const chapters: ChapterMapping[] = [];
  let totalOld = 0;
  let totalNew = 0;
  let affectedChapters = 0;

  // Process all chapters that have cues
  for (const chapterNum of Array.from(chaptersWithCues).sort((a, b) => a - b)) {
    const chapterPath = join(chapterDir, `chapter-${chapterNum}.html`);
    if (!existsSync(chapterPath)) continue;

    const html = readFileSync(chapterPath, "utf-8");
    const $ = cheerio.load(html);

    const mapping = buildChapterMapping($, chapterNum);
    chapters.push(mapping);

    totalOld += mapping.oldCount;
    totalNew += mapping.newCount;
    if (mapping.diff !== 0) affectedChapters++;
  }

  // Count how many cues successfully map
  let cuesMapped = 0;
  for (const cue of allCues) {
    const chapterMapping = chapters.find((c) => c.chapter === cue.chapter);
    if (!chapterMapping) continue;
    const mapping = chapterMapping.mappings.find((m) => m.oldIndex === cue.paragraph);
    if (mapping) cuesMapped++;
  }

  return {
    book: bookSlug,
    chapters,
    totalOld,
    totalNew,
    affectedChapters,
    cuesMapped,
    cuesTotal: allCues.length,
  };
}

function printBookSummary(result: BookMapping): void {
  const hasChanges = result.affectedChapters > 0;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`${result.book}${hasChanges ? "" : " (no changes)"}`);
  console.log(`${"=".repeat(70)}`);

  if (!hasChanges) {
    console.log(`  All ${result.chapters.length} chapters: old === new. No migration needed.`);
    console.log(`  Cues: ${result.cuesTotal} (all unaffected)`);
    return;
  }

  // Show affected chapters
  for (const ch of result.chapters) {
    if (ch.diff === 0) continue;
    console.log(
      `  Ch ${String(ch.chapter).padStart(2)}: ${ch.oldCount} → ${ch.newCount} (${ch.diff > 0 ? "+" : ""}${ch.diff})`,
    );

    // Show expanded elements
    const expanded = ch.mappings.filter((m) => m.expanded);
    for (const m of expanded.slice(0, 3)) {
      console.log(`    [${m.tag}] idx ${m.oldIndex} → ${m.newIndex}: "${m.oldText.slice(0, 50)}"`);
    }
    if (expanded.length > 3) {
      console.log(`    ... and ${expanded.length - 3} more expanded elements`);
    }
  }

  console.log(
    `\n  Summary: ${result.affectedChapters}/${result.chapters.length} chapters affected`,
  );
  console.log(`  Cues mapped: ${result.cuesMapped}/${result.cuesTotal}`);
}

async function main(): Promise<void> {
  const arg = process.argv[2];

  if (!arg) {
    console.log("Usage:");
    console.log("  bun build-leaf-index-mappings.ts <bookSlug>");
    console.log("  bun build-leaf-index-mappings.ts --all");
    process.exit(1);
  }

  const ALL_BOOKS_WITH_CUES = [
    "1984",
    "1984-English",
    "Alice-Wonderland",
    "Conrad-Secret-Agent",
    "Conrad-Tajny-Agent",
    "Faraon",
    "Krolowa-Sniegu",
    "Lalka",
    "Macbeth",
    "Midsummer-Nights-Dream",
    "Othello",
    "Romeo-And-Juliet",
    "Snow-Queen",
    "The-Tempest",
    "Walk-Tom",
    "Wukong",
    "agatha-christie_the-mysterious-affair-at-styles-openai",
  ];

  const books = arg === "--all" ? ALL_BOOKS_WITH_CUES : [arg];
  const allResults: BookMapping[] = [];

  for (const book of books) {
    const result = await buildBookMapping(book);
    allResults.push(result);
    printBookSummary(result);
  }

  // Save mapping files for books that need migration
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const needsMigration = allResults.filter((r) => r.affectedChapters > 0);

  for (const result of needsMigration) {
    const outputPath = join(OUTPUT_DIR, `${result.book}.json`);
    writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\nSaved: ${outputPath}`);
  }

  // Grand summary
  console.log(`\n${"─".repeat(70)}`);
  console.log("GRAND SUMMARY");
  console.log(`${"─".repeat(70)}`);
  console.log(`  Books checked: ${allResults.length}`);
  console.log(`  Books needing migration: ${needsMigration.length}`);
  console.log(`  Total cues: ${allResults.reduce((s, r) => s + r.cuesTotal, 0)}`);
  console.log(`  Cues in affected books: ${needsMigration.reduce((s, r) => s + r.cuesTotal, 0)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
