/**
 * Verify embedding text matches what the player renders at the referenced paragraph indices.
 *
 * Flow:
 *   1. Match embedding → summary bullet via paragraphNumber == mainParagraphNumber
 *   2. Sanity check: paragraphsSummary matches <Summary> in embedding
 *   3. Real test: does <Text> in embedding match what the player renders at paragraphNumbers[]?
 *
 * Usage: bun verify-embeddings.ts <bookSlug> [chapter]
 */

import { readFileSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

const OLD_FORMAT_DIR = "/Users/lukaszgandecki/projects/bookgenius/frontend/books";
const NEW_FORMAT_DIR = "/Users/lukaszgandecki/projects/bookgenius/frontend/ConvexAssets/books";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CheerioElement = any;

function isPureEmParagraph($: cheerio.CheerioAPI, el: CheerioElement): boolean {
  const html = $(el).html()?.trim() || "";
  const emMatch = html.match(/^<em[^>]*>([\s\S]*)<\/em>$/);
  if (!emMatch) return false;
  return html.replace(/<em[^>]*>[\s\S]*<\/em>/g, "").trim().length === 0;
}

interface FlatElement {
  index: number;
  content: string;
  type: string;
}

function getPlayerSimulatedFlat($: cheerio.CheerioAPI, chapterNum: number): FlatElement[] {
  const section = $(`[data-chapter="${chapterNum}"]`);
  const elements: FlatElement[] = [];
  let currentIndex = 0;

  section.children().each((_, child) => {
    const tag = child.tagName?.toLowerCase();
    const $child = $(child);

    if (tag && ["h2", "h3", "h4", "h5"].includes(tag)) {
      elements.push({ index: currentIndex++, content: $child.text().trim(), type: "heading" });
      return;
    }

    if (tag === "div" && $child.attr("data-speaker") && $child.attr("data-label")) {
      const speaker = $child.attr("data-speaker") || "";
      const label = $child.attr("data-label") || "";
      elements.push({ index: currentIndex++, content: label, type: `label(${speaker})` });
      $child.children().each((_, innerChild) => {
        if (innerChild.tagName?.toLowerCase() === "p") {
          const isD =
            $(innerChild).attr("data-is-didaskalia") === "true" || isPureEmParagraph($, innerChild);
          elements.push({
            index: currentIndex++,
            content: $(innerChild).text().trim(),
            type: isD ? "didaskalia" : `dialogue(${speaker})`,
          });
        }
      });
      return;
    }

    if (tag === "p") {
      const isD = $child.attr("data-is-didaskalia") === "true" || isPureEmParagraph($, child);
      elements.push({
        index: currentIndex++,
        content: $child.text().trim(),
        type: isD ? "didaskalia" : "standalone-p",
      });
      return;
    }

    if (tag && $child.text().trim()) {
      elements.push({
        index: currentIndex++,
        content: $child.text().trim(),
        type: `other(${tag})`,
      });
    }
  });

  return elements;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").replace(/['']/g, "'").replace(/[""]/g, '"').trim().toLowerCase();
}

/** Extract <Text>...</Text> content from embedding text field */
function extractEmbeddingSourceText(text: string): string {
  const match = text.match(/<Text>([\s\S]*)<\/Text>/);
  return match ? match[1].trim() : "";
}

/** Extract <Summary>...</Summary> content from embedding text field */
function extractEmbeddingSummary(text: string): string {
  const match = text.match(/<Summary>([\s\S]*?)<\/Summary>/);
  return match ? match[1].trim() : text.trim();
}

interface Bullet {
  paragraphsSummary: string;
  paragraphNumbers: number[];
  mainParagraphNumber: number;
}

interface EmbeddingEntry {
  text: string;
  chapter: number;
  paragraphNumber: number;
}

function main() {
  const bookSlug = process.argv[2];
  const filterChapter = process.argv[3] ? parseInt(process.argv[3], 10) : null;

  if (!bookSlug) {
    console.log("Usage: bun verify-embeddings.ts <bookSlug> [chapter]");
    process.exit(1);
  }

  const embeddingsPath = `/tmp/${bookSlug.toLowerCase()}-embeddings.json`;
  const summariesPath = `/Users/lukaszgandecki/projects/bookgenius/backend/books-data/${bookSlug.toLowerCase()}/temporary-output/summaries-with-paragraphs.json`;

  const rawEmbeddings = JSON.parse(
    readFileSync(embeddingsPath, "utf-8"),
    (key: string, value: unknown) => (key === "Embeddings" ? undefined : value),
  ) as Array<[number, EmbeddingEntry[]]>;

  const summaries = JSON.parse(readFileSync(summariesPath, "utf-8")) as Array<{
    chapterSummary: { chapterBulletPoints: Bullet[] };
  }>;

  const stats = { total: 0, summaryOk: 0, textOk: 0, textBad: 0 };

  for (const [chapterNum, embeddings] of rawEmbeddings) {
    if (filterChapter && chapterNum !== filterChapter) continue;
    const result = verifyChapter(bookSlug, chapterNum, embeddings, summaries, filterChapter);
    if (!result) continue;
    stats.total += result.total;
    stats.summaryOk += result.summaryOk;
    stats.textOk += result.textOk;
    stats.textBad += result.textBad;
  }

  console.log(`\n${"─".repeat(80)}`);
  console.log(`SUMMARY: ${bookSlug}`);
  console.log(`${"─".repeat(80)}\n`);
  console.log(`  Embeddings checked: ${stats.total}`);
  console.log(`  Summary sanity:     ${stats.summaryOk}/${stats.total}`);
  console.log(`  Text matches:       ${stats.textOk}/${stats.total}`);
  console.log(`  Text mismatches:    ${stats.textBad}/${stats.total}`);

  if (stats.textBad === 0) {
    console.log(`\n  RESULT: All embeddings point to correct player content!\n`);
  } else {
    console.log(`\n  RESULT: ${stats.textBad} embeddings point to WRONG content.\n`);
  }
}

function verifyChapter(
  bookSlug: string,
  chapterNum: number,
  embeddings: EmbeddingEntry[],
  summaries: Array<{ chapterSummary: { chapterBulletPoints: Bullet[] } }>,
  filterChapter: number | null,
): { total: number; summaryOk: number; textOk: number; textBad: number } | null {
  const bullets = summaries[chapterNum - 1]?.chapterSummary?.chapterBulletPoints;
  if (!bullets) return null;

  const newPath = join(NEW_FORMAT_DIR, bookSlug, "chapters-source", `chapter-${chapterNum}.html`);
  let playerElements: FlatElement[];
  try {
    const $new = cheerio.load(readFileSync(newPath, "utf-8"));
    playerElements = getPlayerSimulatedFlat($new, chapterNum);
  } catch {
    return null;
  }

  const oldPath = join(OLD_FORMAT_DIR, bookSlug, "booksContent", `chapter${chapterNum}.xml`);
  let oldCount = 0;
  try {
    const $old = cheerio.load(readFileSync(oldPath, "utf-8"), { xmlMode: true });
    oldCount = $old("Chapter > *").length;
  } catch {
    /* ignore */
  }

  const countDiff = playerElements.length - oldCount;
  if (countDiff === 0 && !filterChapter) return null;

  console.log(`\n${"=".repeat(80)}`);
  console.log(
    `Chapter ${chapterNum}: old=${oldCount}, player=${playerElements.length} (diff: ${countDiff})`,
  );
  console.log(`${"=".repeat(80)}\n`);

  const stats = { total: 0, summaryOk: 0, textOk: 0, textBad: 0 };

  for (const emb of embeddings) {
    stats.total++;
    const bullet = bullets.find((b) => b.mainParagraphNumber === emb.paragraphNumber);
    if (!bullet) {
      console.log(`  [?] No bullet for mainParagraph=${emb.paragraphNumber} — skipping`);
      continue;
    }

    const embSummary = extractEmbeddingSummary(emb.text);
    if (normalize(embSummary).slice(0, 60) === normalize(bullet.paragraphsSummary).slice(0, 60)) {
      stats.summaryOk++;
    }

    const match = compareEmbeddingToPlayer(emb, bullet, playerElements);
    if (match.ok) {
      stats.textOk++;
    } else {
      stats.textBad++;
      console.log(`  MISMATCH — embedding #${emb.paragraphNumber}:`);
      console.log(`    Summary: ${bullet.paragraphsSummary.slice(0, 70)}...`);
      console.log(`    Paragraph indices: [${bullet.paragraphNumbers.join(", ")}]`);
      console.log(`    Embed text: "${match.embText.slice(0, 100)}"`);
      console.log(`    Player text: "${match.playerText.slice(0, 100)}"`);
      console.log();
    }
  }

  return stats;
}

function compareEmbeddingToPlayer(
  emb: EmbeddingEntry,
  bullet: Bullet,
  playerElements: FlatElement[],
): { ok: boolean; embText: string; playerText: string } {
  const embSourceText = extractEmbeddingSourceText(emb.text);

  const playerTexts: string[] = [];
  for (const pn of bullet.paragraphNumbers) {
    if (pn >= playerElements.length) continue;
    const el = playerElements[pn];
    if (el.type.startsWith("label(") || el.type === "heading" || el.type === "didaskalia") continue;
    playerTexts.push(el.content);
  }
  const playerCombined = playerTexts.join(" ");

  // Strip "speaker: " prefixes from embedding text
  const embLines = embSourceText.split("\n").map((line) => {
    const colonIdx = line.indexOf(": ");
    return colonIdx > 0 ? line.slice(colonIdx + 2).trim() : line.trim();
  });
  const embContentOnly = embLines.join(" ");

  const ok =
    normalize(embContentOnly).slice(0, 80) === normalize(playerCombined).slice(0, 80) ||
    normalize(playerCombined).includes(normalize(embContentOnly).slice(0, 60));

  return { ok, embText: embContentOnly, playerText: playerCombined };
}

main();
