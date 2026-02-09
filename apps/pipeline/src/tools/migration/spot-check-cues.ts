/**
 * Spot check: Do cues match content in OLD format (./books/{slug}/booksContent/)
 * vs NEW format (./ConvexAssets/books/{slug}/chapters-source/)?
 *
 * This tells us if non-play books have drifted like plays have.
 */

import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

const CONVEX_URL = process.env.CONVEX_URL || "https://willing-pig-943.convex.cloud";
const OLD_FORMAT_DIR = "/Users/lukaszgandecki/projects/bookgenius/frontend/books";
const NEW_FORMAT_DIR = "/Users/lukaszgandecki/projects/bookgenius/frontend/ConvexAssets/books";

interface CueCheck {
  cueId: string;
  chapter: number;
  paragraph: number;
  fileBasename: string;
  oldContent?: string;
  newContent?: string;
  matches: boolean;
  error?: string;
}

async function spotCheckBook(bookSlug: string, sampleSize: number = 10): Promise<void> {
  const client = new ConvexHttpClient(CONVEX_URL);

  console.log(`\n🔍 Spot checking: ${bookSlug}`);
  console.log(`${"=".repeat(60)}`);

  // Get cues from Convex
  const cues = (await client.query("migration:getAllCuesForBook" as any, {
    bookPath: `books/${bookSlug}`,
  })) as {
    backgroundCues: Array<{ _id: string; chapter: number; paragraph: number; fileBasename: string }>;
    musicCues: Array<{ _id: string; chapter: number; paragraph: number; fileBasename: string }>;
  };

  const allCues = [
    ...cues.backgroundCues.map((c) => ({ ...c, type: "background" as const })),
    ...cues.musicCues.map((c) => ({ ...c, type: "music" as const })),
  ];

  console.log(`Found ${allCues.length} cues total`);

  // Sample a few cues at different positions
  const samples: typeof allCues = [];
  if (allCues.length <= sampleSize) {
    samples.push(...allCues);
  } else {
    // Take cues from beginning, middle, end
    const step = Math.floor(allCues.length / sampleSize);
    for (let i = 0; i < sampleSize; i++) {
      const idx = Math.min(i * step, allCues.length - 1);
      samples.push(allCues[idx]);
    }
  }

  console.log(`Checking ${samples.length} sample cues...\n`);

  const results: CueCheck[] = [];

  for (const cue of samples) {
    const result: CueCheck = {
      cueId: cue._id,
      chapter: cue.chapter,
      paragraph: cue.paragraph,
      fileBasename: cue.fileBasename,
      matches: false,
    };

    try {
      // Read OLD format (booksContent XML)
      const oldPath = join(OLD_FORMAT_DIR, bookSlug, "booksContent", `chapter${cue.chapter}.xml`);
      let oldXml: string;
      try {
        oldXml = readFileSync(oldPath, "utf-8");
      } catch {
        result.error = "Old format file not found";
        results.push(result);
        continue;
      }

      const $old = cheerio.load(oldXml, { xmlMode: true });
      const oldElements = $old("Chapter > *").toArray();
      const oldElement = oldElements[cue.paragraph];

      if (!oldElement) {
        result.error = `Old format: No element at index ${cue.paragraph} (has ${oldElements.length})`;
        results.push(result);
        continue;
      }

      result.oldContent = $old(oldElement).text().trim().slice(0, 100);

      // Read NEW format (chapters-source HTML)
      const newPath = join(
        NEW_FORMAT_DIR,
        bookSlug,
        "chapters-source",
        `chapter-${cue.chapter}.html`,
      );
      let newHtml: string;
      try {
        newHtml = readFileSync(newPath, "utf-8");
      } catch {
        result.error = "New format file not found";
        results.push(result);
        continue;
      }

      const $new = cheerio.load(newHtml);
      const newElements = $new(`[data-chapter="${cue.chapter}"] > *`).toArray();
      const newElement = newElements[cue.paragraph];

      if (!newElement) {
        result.error = `New format: No element at index ${cue.paragraph} (has ${newElements.length})`;
        results.push(result);
        continue;
      }

      result.newContent = $new(newElement).text().trim().slice(0, 100);

      // Check if content matches (fuzzy - first 50 chars)
      const oldSnippet = result.oldContent.slice(0, 50).replace(/\s+/g, " ");
      const newSnippet = result.newContent.slice(0, 50).replace(/\s+/g, " ");
      result.matches = oldSnippet === newSnippet || result.newContent.includes(oldSnippet);

      // Debug: Show character codes if mismatch
      if (!result.matches && oldSnippet.trim() === newSnippet.trim()) {
        result.error = `Whitespace diff: old[${oldSnippet.charCodeAt(0)}] new[${newSnippet.charCodeAt(0)}]`;
      }
    } catch (err) {
      result.error = `Error: ${err}`;
    }

    results.push(result);
  }

  // Print results
  console.log(`${"─".repeat(60)}\n`);

  let matches = 0;
  let mismatches = 0;
  let errors = 0;

  for (const result of results) {
    if (result.error) {
      console.log(`❌ Ch${result.chapter} Para${result.paragraph} - ${result.error}`);
      errors++;
    } else if (result.matches) {
      console.log(`✅ Ch${result.chapter} Para${result.paragraph} - Content matches`);
      matches++;
    } else {
      console.log(`⚠️  Ch${result.chapter} Para${result.paragraph} - Content MISMATCH`);
      console.log(`   Old: ${result.oldContent}`);
      console.log(`   New: ${result.newContent}`);
      mismatches++;
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Results for ${bookSlug}:`);
  console.log(`  ✅ Matches: ${matches}`);
  console.log(`  ⚠️  Mismatches: ${mismatches}`);
  console.log(`  ❌ Errors: ${errors}`);
  console.log(
    `  📊 Success rate: ${((matches / results.length) * 100).toFixed(1)}%`,
  );
}

async function main() {
  const bookSlug = process.argv[2] || "1984";
  const sampleSize = process.argv[3] ? parseInt(process.argv[3]) : 999999; // Default: check all
  await spotCheckBook(bookSlug, sampleSize);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
