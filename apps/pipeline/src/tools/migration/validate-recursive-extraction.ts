/**
 * Validate that the player's normalizeChapterHtml indexing matches old XML paragraph indices.
 *
 * Simulates exactly what the player does:
 *   1. transformFormatBToPlayRows: converts <div data-speaker data-label> → play-row with speaker label <p>
 *   2. indexPurePlayFormat: assigns sequential data-index to h2-h5 headings + all <p>s inside play-rows
 *
 * Then compares:
 *   - Old XML element count (what cues were created from)
 *   - Player-simulated index count (what data-index values the player assigns)
 *   - Content at each cue index (do the cues point to the same text?)
 */

import { ConvexHttpClient } from "convex/browser";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

const CONVEX_URL = process.env.CONVEX_URL || "https://willing-pig-943.convex.cloud";
const OLD_FORMAT_DIR = "/Users/lukaszgandecki/projects/bookgenius/frontend/books";
const NEW_FORMAT_DIR = "/Users/lukaszgandecki/projects/bookgenius/frontend/ConvexAssets/books";

/**
 * Check if a <p> contains only <em> (pure stage direction).
 * Mirrors isPureEmParagraph from htmlNormalizer.ts
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CheerioElement = any;

function isPureEmParagraph($: cheerio.CheerioAPI, el: CheerioElement): boolean {
  const html = $(el).html()?.trim() || "";
  const emMatch = html.match(/^<em[^>]*>([\s\S]*)<\/em>$/);
  if (!emMatch) return false;
  const withoutEm = html.replace(/<em[^>]*>[\s\S]*<\/em>/g, "").trim();
  return withoutEm.length === 0;
}

interface IndexedElement {
  index: number;
  content: string; // first 80 chars of text
  type: "heading" | "speaker-label" | "dialogue" | "didaskalia" | "standalone";
  speaker?: string;
}

/**
 * Simulate what the player's normalizeChapterHtml does for Format B play HTML.
 *
 * This replicates:
 *   transformFormatBToPlayRows → creates speaker label + content paragraphs
 *   indexPurePlayFormat → assigns sequential indices to h2-h5 and play-row paragraphs
 *
 * Returns a flat list of indexed elements in the order the player would assign data-index.
 */
function simulatePlayerIndexing($: cheerio.CheerioAPI, chapterNum: number): IndexedElement[] {
  const section = $(`[data-chapter="${chapterNum}"]`);
  const indexed: IndexedElement[] = [];
  let currentIndex = 0;

  section.children().each((_, child) => {
    const tag = child.tagName?.toLowerCase();
    const $child = $(child);

    // Headings: h2-h5 get their own index
    if (tag && ["h2", "h3", "h4", "h5"].includes(tag)) {
      indexed.push({
        index: currentIndex++,
        content: $child.text().trim().slice(0, 80),
        type: "heading",
      });
      return;
    }

    // Format B speaker block: <div data-speaker data-label>
    if (tag === "div" && $child.attr("data-speaker") && $child.attr("data-label")) {
      const speaker = $child.attr("data-speaker") || "";
      const label = $child.attr("data-label") || "";

      // Speaker label paragraph (created by transformFormatBToPlayRows)
      indexed.push({ index: currentIndex++, content: label, type: "speaker-label", speaker });

      // Content paragraphs inside the speaker block
      $child.children().each((_, innerChild) => {
        const innerTag = innerChild.tagName?.toLowerCase();
        if (innerTag === "p") {
          const isDidaskalia =
            $(innerChild).attr("data-is-didaskalia") === "true" || isPureEmParagraph($, innerChild);

          indexed.push({
            index: currentIndex++,
            content: $(innerChild).text().trim().slice(0, 80),
            type: isDidaskalia ? "didaskalia" : "dialogue",
            speaker,
          });
        }
      });
      return;
    }

    // Standalone didaskalia: <p data-is-didaskalia="true"> or pure <em> paragraph
    if (tag === "p") {
      const isExplicitDidaskalia = $child.attr("data-is-didaskalia") === "true";
      const isPureEm = isPureEmParagraph($, child);

      if (isExplicitDidaskalia || isPureEm) {
        indexed.push({
          index: currentIndex++,
          content: $child.text().trim().slice(0, 80),
          type: "didaskalia",
        });
        return;
      }

      // Regular standalone paragraph (non-speaker, non-didaskalia)
      // In indexPurePlayFormat, these would NOT get indexed via h2-h5/.play-row selector
      // But in indexMixedFormatChildren (used when data-chapter-format="mixed"), they would
      // For plays, if they exist, they'd be picked up as direct children
      indexed.push({
        index: currentIndex++,
        content: $child.text().trim().slice(0, 80),
        type: "standalone",
      });
      return;
    }

    // Any other element - not typically indexed in pure play format
    // but log it so we can see if something unexpected exists
    if (tag && $child.text().trim()) {
      indexed.push({
        index: currentIndex++,
        content: `[${tag}] ${$child.text().trim().slice(0, 60)}`,
        type: "standalone",
      });
    }
  });

  return indexed;
}

/**
 * Get old XML elements as flat array with text content.
 */
function getOldXmlElements($: cheerio.CheerioAPI): Array<{ content: string; tag: string }> {
  const elements: Array<{ content: string; tag: string }> = [];

  $("Chapter > *").each((_, el) => {
    elements.push({
      content: $(el).text().trim().slice(0, 80),
      tag: el.tagName?.toLowerCase() || "?",
    });
  });

  return elements;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

interface ChapterResult {
  chapter: number;
  oldCount: number;
  playerCount: number;
  matches: boolean;
  cueResults: Array<{
    cueIndex: number;
    cueType: string;
    oldContent: string;
    playerContent: string;
    contentMatch: boolean;
  }>;
}

async function validateBook(bookSlug: string): Promise<void> {
  const client = new ConvexHttpClient(CONVEX_URL);

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Validating: ${bookSlug}`);
  console.log(`${"=".repeat(80)}\n`);

  // Get cues from Convex
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cues = (await client.query("migration:getAllCuesForBook" as any, {
    bookPath: `books/${bookSlug}`,
  })) as {
    backgroundCues: Array<{ chapter: number; paragraph: number; fileBasename: string }>;
    musicCues: Array<{ chapter: number; paragraph: number; fileBasename: string }>;
  };

  const allCues = [
    ...cues.backgroundCues.map((c) => ({ ...c, type: "bg" })),
    ...cues.musicCues.map((c) => ({ ...c, type: "music" })),
  ];
  const chaptersWithCues = new Set(allCues.map((c) => c.chapter));

  console.log(`Found ${allCues.length} cues across ${chaptersWithCues.size} chapters\n`);

  const results: ChapterResult[] = [];
  let totalCues = 0;
  let matchingCues = 0;

  for (const chapter of Array.from(chaptersWithCues).sort((a, b) => a - b)) {
    // Read old XML
    const oldPath = join(OLD_FORMAT_DIR, bookSlug, "booksContent", `chapter${chapter}.xml`);
    if (!existsSync(oldPath)) {
      console.log(`  [skip] No old XML for chapter ${chapter}`);
      continue;
    }
    const oldXml = readFileSync(oldPath, "utf-8");
    const $old = cheerio.load(oldXml, { xmlMode: true });
    const oldElements = getOldXmlElements($old);

    // Read new HTML
    const newPath = join(NEW_FORMAT_DIR, bookSlug, "chapters-source", `chapter-${chapter}.html`);
    if (!existsSync(newPath)) {
      console.log(`  [skip] No new HTML for chapter ${chapter}`);
      continue;
    }
    const newHtml = readFileSync(newPath, "utf-8");
    const $new = cheerio.load(newHtml);
    const playerElements = simulatePlayerIndexing($new, chapter);

    const countMatch = oldElements.length === playerElements.length;

    // Check each cue for this chapter
    const chapterCues = allCues.filter((c) => c.chapter === chapter);
    const cueResults: ChapterResult["cueResults"] = [];

    for (const cue of chapterCues) {
      totalCues++;
      const oldContent =
        cue.paragraph < oldElements.length ? oldElements[cue.paragraph].content : "OUT OF BOUNDS";
      const playerContent =
        cue.paragraph < playerElements.length
          ? playerElements[cue.paragraph].content
          : "OUT OF BOUNDS";

      const contentMatch =
        normalize(oldContent).slice(0, 40) === normalize(playerContent).slice(0, 40) ||
        normalize(playerContent).includes(normalize(oldContent).slice(0, 30));

      if (contentMatch) matchingCues++;

      cueResults.push({
        cueIndex: cue.paragraph,
        cueType: cue.type,
        oldContent,
        playerContent,
        contentMatch,
      });
    }

    results.push({
      chapter,
      oldCount: oldElements.length,
      playerCount: playerElements.length,
      matches: countMatch,
      cueResults,
    });
  }

  // Print results
  console.log(`${"─".repeat(80)}`);
  console.log(`CHAPTER COUNTS: Old XML vs Player Simulation`);
  console.log(`${"─".repeat(80)}\n`);

  for (const result of results) {
    const status = result.matches ? "✅" : "❌";
    const diff = result.playerCount - result.oldCount;
    const diffStr = diff === 0 ? "" : ` (diff: ${diff > 0 ? "+" : ""}${diff})`;

    console.log(
      `  ${status} Ch ${String(result.chapter).padStart(2)}: ` +
        `old=${String(result.oldCount).padStart(4)}, ` +
        `player=${String(result.playerCount).padStart(4)}${diffStr}`,
    );
  }

  // Print cue content validation
  console.log(`\n${"─".repeat(80)}`);
  console.log(`CUE CONTENT VALIDATION`);
  console.log(`${"─".repeat(80)}\n`);

  let mismatchCount = 0;
  for (const result of results) {
    const mismatches = result.cueResults.filter((c) => !c.contentMatch);
    if (mismatches.length > 0) {
      console.log(`  Chapter ${result.chapter} — ${mismatches.length} mismatches:`);
      for (const m of mismatches.slice(0, 5)) {
        console.log(`    [${m.cueType}] index ${m.cueIndex}:`);
        console.log(`      old:    "${m.oldContent.slice(0, 60)}"`);
        console.log(`      player: "${m.playerContent.slice(0, 60)}"`);
      }
      if (mismatches.length > 5) {
        console.log(`    ... and ${mismatches.length - 5} more`);
      }
      mismatchCount += mismatches.length;
      console.log();
    }
  }

  if (mismatchCount === 0) {
    console.log(`  All cues match!\n`);
  }

  // Summary
  const countMatches = results.filter((r) => r.matches).length;
  console.log(`${"─".repeat(80)}`);
  console.log(`SUMMARY: ${bookSlug}`);
  console.log(`${"─".repeat(80)}\n`);
  console.log(`  Chapter count match: ${countMatches}/${results.length}`);
  console.log(
    `  Cue content match:   ${matchingCues}/${totalCues} (${((matchingCues / totalCues) * 100).toFixed(1)}%)`,
  );

  if (matchingCues === totalCues) {
    console.log(`\n  RESULT: Player indexing MATCHES old XML. Cues are correct!\n`);
  } else {
    console.log(
      `\n  RESULT: ${totalCues - matchingCues} cues do NOT match. Needs investigation.\n`,
    );
  }
}

async function main() {
  const bookSlug = process.argv[2];

  if (!bookSlug) {
    console.log("Usage: bun validate-recursive-extraction.ts <bookSlug>");
    console.log("\nPlay books to validate:");
    console.log("  The-Tempest, Othello, Macbeth, Midsummer-Nights-Dream");
    console.log("\nOr 'all' to validate all play books");
    process.exit(1);
  }

  if (bookSlug === "all") {
    const plays = ["The-Tempest", "Othello", "Macbeth", "Midsummer-Nights-Dream"];
    for (const play of plays) {
      await validateBook(play);
    }
  } else {
    await validateBook(bookSlug);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
