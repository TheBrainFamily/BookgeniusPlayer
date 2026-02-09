/**
 * Migrate embedding files to use new recursive leaf-element paragraph indices.
 *
 * Updates:
 *   - summaries-with-paragraphs.json: paragraphNumbers[] and mainParagraphNumber
 *   - embeddings.json: paragraphNumber
 *
 * Usage:
 *   bun migrate-embeddings.ts <bookSlug>
 *   bun migrate-embeddings.ts --all
 *   bun migrate-embeddings.ts --all --dry-run
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const MAPPINGS_DIR =
  "/Users/lukaszgandecki/projects/bookgenius/frontend/apps/pipeline/src/tools/migration/mappings";
const BOOKS_DATA_DIR = "/Users/lukaszgandecki/projects/bookgenius/backend/books-data";

interface IndexMapping {
  oldIndex: number;
  newIndex: number;
}

interface BookMapping {
  book: string;
  chapters: Array<{ chapter: number; diff: number; mappings: IndexMapping[] }>;
}

function slugToDataDir(bookSlug: string): string {
  return bookSlug.toLowerCase().replace(/-openai$/, "");
}

function loadMapping(bookSlug: string): BookMapping | null {
  const path = join(MAPPINGS_DIR, `${bookSlug}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function buildLookup(mapping: BookMapping): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const ch of mapping.chapters) {
    for (const m of ch.mappings) {
      lookup.set(`${ch.chapter}:${m.oldIndex}`, m.newIndex);
    }
  }
  return lookup;
}

function mapIndex(lookup: Map<string, number>, chapter: number, oldIdx: number): number {
  return lookup.get(`${chapter}:${oldIdx}`) ?? oldIdx;
}

interface MigrateResult {
  book: string;
  summariesUpdated: number;
  summariesTotal: number;
  embeddingsUpdated: number;
  embeddingsTotal: number;
}

function migrateSummaries(
  bookSlug: string,
  lookup: Map<string, number>,
  dryRun: boolean,
): { updated: number; total: number } {
  const dataDir = slugToDataDir(bookSlug);
  const path = join(BOOKS_DATA_DIR, dataDir, "temporary-output", "summaries-with-paragraphs.json");
  if (!existsSync(path)) {
    console.log(`  [skip] No summaries file: ${dataDir}`);
    return { updated: 0, total: 0 };
  }

  const summaries = JSON.parse(readFileSync(path, "utf-8"));
  let updated = 0;
  let total = 0;

  for (let chIdx = 0; chIdx < summaries.length; chIdx++) {
    const chapterNum = chIdx + 1;
    const bullets = summaries[chIdx]?.chapterSummary?.chapterBulletPoints;
    if (!bullets) continue;

    for (const bullet of bullets) {
      total++;
      let changed = false;

      // Map paragraphNumbers array
      const newNumbers = bullet.paragraphNumbers.map((old: number) => {
        const mapped = mapIndex(lookup, chapterNum, old);
        if (mapped !== old) changed = true;
        return mapped;
      });

      // Map mainParagraphNumber
      const newMain = mapIndex(lookup, chapterNum, bullet.mainParagraphNumber);
      if (newMain !== bullet.mainParagraphNumber) changed = true;

      if (changed) {
        bullet.paragraphNumbers = newNumbers;
        bullet.mainParagraphNumber = newMain;
        updated++;
      }
    }
  }

  if (!dryRun && updated > 0) {
    writeFileSync(path, JSON.stringify(summaries, null, 2));
  }

  return { updated, total };
}

function migrateEmbeddings(
  bookSlug: string,
  lookup: Map<string, number>,
  dryRun: boolean,
): { updated: number; total: number } {
  const dataDir = slugToDataDir(bookSlug);
  const path = join(BOOKS_DATA_DIR, dataDir, "temporary-output", "embeddings.json");
  if (!existsSync(path)) {
    console.log(`  [skip] No embeddings file: ${dataDir}`);
    return { updated: 0, total: 0 };
  }

  // Parse with reviver that strips Embeddings vectors to save memory for display
  // But we need to preserve them in the output!
  const raw = readFileSync(path, "utf-8");
  const embeddings = JSON.parse(raw);
  let updated = 0;
  let total = 0;

  for (const entry of embeddings) {
    const chapterNum = entry[0];
    const docs = entry[1];

    for (const doc of docs) {
      total++;
      const newIdx = mapIndex(lookup, chapterNum, doc.paragraphNumber);
      if (newIdx !== doc.paragraphNumber) {
        doc.paragraphNumber = newIdx;
        updated++;
      }
    }
  }

  if (!dryRun && updated > 0) {
    writeFileSync(path, JSON.stringify(embeddings));
  }

  return { updated, total };
}

function migrateBook(bookSlug: string, dryRun: boolean): MigrateResult | null {
  const mapping = loadMapping(bookSlug);
  if (!mapping) return null;

  // Skip books with no actual changes
  const hasChanges = mapping.chapters.some((c) => c.diff > 0);
  if (!hasChanges) return null;

  const lookup = buildLookup(mapping);

  console.log(`${bookSlug}${dryRun ? " (dry run)" : ""}:`);

  const sumResult = migrateSummaries(bookSlug, lookup, dryRun);
  const embResult = migrateEmbeddings(bookSlug, lookup, dryRun);

  console.log(`  summaries: ${sumResult.updated}/${sumResult.total} bullets updated`);
  console.log(`  embeddings: ${embResult.updated}/${embResult.total} entries updated`);

  return {
    book: bookSlug,
    summariesUpdated: sumResult.updated,
    summariesTotal: sumResult.total,
    embeddingsUpdated: embResult.updated,
    embeddingsTotal: embResult.total,
  };
}

function main(): void {
  const arg = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!arg) {
    console.log("Usage: bun migrate-embeddings.ts <bookSlug> [--dry-run]");
    console.log("       bun migrate-embeddings.ts --all [--dry-run]");
    process.exit(1);
  }

  const BOOKS_WITH_MAPPINGS = [
    "1984",
    "1984-English",
    "Alice-Wonderland",
    "Krolowa-Sniegu",
    "Lalka",
    "Midsummer-Nights-Dream",
    "Othello",
    "agatha-christie_the-mysterious-affair-at-styles-openai",
  ];

  const books = arg === "--all" ? BOOKS_WITH_MAPPINGS : [arg];
  const results: MigrateResult[] = [];

  for (const book of books) {
    const result = migrateBook(book, dryRun);
    if (result) results.push(result);
  }

  console.log(
    `\nDone. ${results.length} books updated${dryRun ? " (dry run, no files changed)" : ""}.`,
  );
}

main();
