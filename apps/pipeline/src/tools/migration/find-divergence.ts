/**
 * Find exactly WHERE old XML and player-simulated indexing diverge for a specific chapter.
 * Walks element by element, printing side-by-side comparison until mismatch is found.
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
  const withoutEm = html.replace(/<em[^>]*>[\s\S]*<\/em>/g, "").trim();
  return withoutEm.length === 0;
}

interface FlatElement {
  index: number;
  content: string;
  type: string;
  raw?: string;
}

function getOldXmlFlat($: cheerio.CheerioAPI): FlatElement[] {
  const elements: FlatElement[] = [];
  let i = 0;
  $("Chapter > *").each((_, el) => {
    const tag = el.tagName?.toLowerCase() || "?";
    const text = $(el).text().trim().slice(0, 80);
    const html = $.html(el)?.slice(0, 120) || "";
    elements.push({ index: i++, content: text, type: tag, raw: html });
  });
  return elements;
}

function getPlayerSimulatedFlat($: cheerio.CheerioAPI, chapterNum: number): FlatElement[] {
  const section = $(`[data-chapter="${chapterNum}"]`);
  const elements: FlatElement[] = [];
  let currentIndex = 0;

  section.children().each((_, child) => {
    const tag = child.tagName?.toLowerCase();
    const $child = $(child);

    if (tag && ["h2", "h3", "h4", "h5"].includes(tag)) {
      elements.push({
        index: currentIndex++,
        content: $child.text().trim().slice(0, 80),
        type: `heading(${tag})`,
      });
      return;
    }

    if (tag === "div" && $child.attr("data-speaker") && $child.attr("data-label")) {
      const speaker = $child.attr("data-speaker") || "";
      const label = $child.attr("data-label") || "";

      elements.push({ index: currentIndex++, content: label, type: `label(${speaker})` });

      $child.children().each((_, innerChild) => {
        const innerTag = innerChild.tagName?.toLowerCase();
        if (innerTag === "p") {
          const isDidaskalia =
            $(innerChild).attr("data-is-didaskalia") === "true" || isPureEmParagraph($, innerChild);
          elements.push({
            index: currentIndex++,
            content: $(innerChild).text().trim().slice(0, 80),
            type: isDidaskalia ? "didaskalia" : `dialogue(${speaker})`,
          });
        }
      });
      return;
    }

    if (tag === "p") {
      const isExplicitDidaskalia = $child.attr("data-is-didaskalia") === "true";
      const isPureEm = isPureEmParagraph($, child);
      elements.push({
        index: currentIndex++,
        content: $child.text().trim().slice(0, 80),
        type: isExplicitDidaskalia || isPureEm ? "didaskalia" : "standalone-p",
      });
      return;
    }

    if (tag && $child.text().trim()) {
      elements.push({
        index: currentIndex++,
        content: $child.text().trim().slice(0, 80),
        type: `other(${tag})`,
      });
    }
  });

  return elements;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function main() {
  const bookSlug = process.argv[2];
  const chapter = parseInt(process.argv[3] || "0", 10);

  if (!bookSlug || !chapter) {
    console.log("Usage: bun find-divergence.ts <bookSlug> <chapter>");
    process.exit(1);
  }

  const oldPath = join(OLD_FORMAT_DIR, bookSlug, "booksContent", `chapter${chapter}.xml`);
  const newPath = join(NEW_FORMAT_DIR, bookSlug, "chapters-source", `chapter-${chapter}.html`);

  const $old = cheerio.load(readFileSync(oldPath, "utf-8"), { xmlMode: true });
  const $new = cheerio.load(readFileSync(newPath, "utf-8"));

  const oldElements = getOldXmlFlat($old);
  const playerElements = getPlayerSimulatedFlat($new, chapter);

  console.log(`\nOld XML: ${oldElements.length} elements`);
  console.log(`Player:  ${playerElements.length} elements`);
  console.log(`Diff:    ${playerElements.length - oldElements.length}\n`);

  // Find first divergence
  const maxLen = Math.max(oldElements.length, playerElements.length);
  let firstDivergence = -1;

  for (let i = 0; i < maxLen; i++) {
    const old = oldElements[i];
    const player = playerElements[i];

    if (!old || !player) {
      firstDivergence = i;
      break;
    }

    const oldNorm = normalize(old.content).slice(0, 40);
    const playerNorm = normalize(player.content).slice(0, 40);

    if (oldNorm !== playerNorm) {
      firstDivergence = i;
      break;
    }
  }

  if (firstDivergence === -1) {
    console.log("No divergence found! All elements match.");
    return;
  }

  console.log(`First divergence at index ${firstDivergence}\n`);

  // Print context around divergence
  const start = Math.max(0, firstDivergence - 3);
  const end = Math.min(maxLen, firstDivergence + 10);

  for (let i = start; i < end; i++) {
    const old = oldElements[i];
    const player = playerElements[i];
    const marker = i === firstDivergence ? " >>> " : "     ";

    const oldStr = old ? `[${old.type}] "${old.content.slice(0, 50)}"` : "--- MISSING ---";
    const playerStr = player
      ? `[${player.type}] "${player.content.slice(0, 50)}"`
      : "--- MISSING ---";

    const match =
      old &&
      player &&
      normalize(old.content).slice(0, 40) === normalize(player.content).slice(0, 40);

    console.log(`${marker}Index ${String(i).padStart(3)}:`);
    console.log(`       OLD:    ${oldStr}`);
    console.log(`       PLAYER: ${playerStr}`);
    console.log(`       ${match ? "OK" : "MISMATCH"}`);
    console.log();
  }

  // Also show what's in the raw XML around divergence
  if (oldElements[firstDivergence]?.raw) {
    console.log(`\nRaw old XML at index ${firstDivergence}:`);
    console.log(oldElements[firstDivergence].raw);
  }
}

main();
