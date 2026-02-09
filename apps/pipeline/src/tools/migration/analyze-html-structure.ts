/**
 * Analyze HTML structure across all books to determine:
 * 1. Which elements appear as children of <section data-chapter="">
 * 2. Which elements contain nested content vs are "leaf" nodes
 * 3. Build lists of container vs leaf elements
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

const BOOKS_DIR = "/Users/lukaszgandecki/projects/bookgenius/frontend/ConvexAssets/books";

interface ElementStats {
  tag: string;
  count: number;
  hasChildren: number; // How many times it contains other block elements
  isLeaf: number; // How many times it's a leaf (no block children)
  examples: string[]; // Sample HTML
}

function analyzeChapters() {
  const stats = new Map<string, ElementStats>();

  // Get all books
  const books = readdirSync(BOOKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  console.log(`📚 Analyzing ${books.length} books...\n`);

  let filesAnalyzed = 0;

  for (const book of books) {
    const chaptersDir = join(BOOKS_DIR, book, "chapters-source");
    try {
      const chapters = readdirSync(chaptersDir).filter((f) => f.endsWith(".html"));

      for (const chapter of chapters) {
        const html = readFileSync(join(chaptersDir, chapter), "utf-8");
        const $ = cheerio.load(html);

        // Find all sections with data-chapter
        $("[data-chapter]").each((_, section) => {
          // Get direct children
          $(section)
            .children()
            .each((__, elem) => {
              const $elem = $(elem);
              const tag = elem.tagName?.toLowerCase();
              if (!tag) return;

              // Initialize stats
              if (!stats.has(tag)) {
                stats.set(tag, { tag, count: 0, hasChildren: 0, isLeaf: 0, examples: [] });
              }

              const stat = stats.get(tag)!;
              stat.count++;

              // Check if it has block-level children
              const blockChildren = $elem.find("p, li, td, dt, dd, div, blockquote, ul, ol, table, header, footer, section").length;

              if (blockChildren > 0) {
                stat.hasChildren++;
              } else {
                stat.isLeaf++;
              }

              // Save example HTML (first 3)
              if (stat.examples.length < 3) {
                const example = $.html($elem).slice(0, 200);
                stat.examples.push(example);
              }
            });
        });

        filesAnalyzed++;
      }
    } catch (err) {
      // Skip books without chapters-source
    }
  }

  console.log(`✅ Analyzed ${filesAnalyzed} chapter files\n`);
  console.log(`${"=".repeat(80)}`);
  console.log(`ELEMENT STATISTICS`);
  console.log(`${"=".repeat(80)}\n`);

  // Sort by count descending
  const sorted = Array.from(stats.values()).sort((a, b) => b.count - a.count);

  for (const stat of sorted) {
    const leafPercent = stat.isLeaf > 0 ? ((stat.isLeaf / stat.count) * 100).toFixed(0) : "0";
    const containerPercent =
      stat.hasChildren > 0 ? ((stat.hasChildren / stat.count) * 100).toFixed(0) : "0";

    console.log(`<${stat.tag}>`);
    console.log(`  Total: ${stat.count}`);
    console.log(`  Leaf (no block children): ${stat.isLeaf} (${leafPercent}%)`);
    console.log(`  Container (has block children): ${stat.hasChildren} (${containerPercent}%)`);
    console.log(`  Example: ${stat.examples[0]?.replace(/\n/g, " ") || "N/A"}`);
    console.log();
  }

  // Generate recommendations
  console.log(`${"=".repeat(80)}`);
  console.log(`RECOMMENDATIONS`);
  console.log(`${"=".repeat(80)}\n`);

  const leafElements = sorted.filter((s) => s.hasChildren === 0).map((s) => s.tag);
  const alwaysContainers = sorted.filter((s) => s.isLeaf === 0).map((s) => s.tag);
  const mixed = sorted.filter((s) => s.hasChildren > 0 && s.isLeaf > 0);

  console.log(`🍃 Always leaf elements (never contain blocks):`);
  console.log(`   ${leafElements.join(", ")}\n`);

  console.log(`📦 Always containers (never used as leaf):`);
  console.log(`   ${alwaysContainers.join(", ")}\n`);

  console.log(`⚠️  Mixed behavior (sometimes leaf, sometimes container):`);
  for (const m of mixed) {
    console.log(
      `   <${m.tag}>: ${m.isLeaf} leaf, ${m.hasChildren} container (${((m.hasChildren / m.count) * 100).toFixed(0)}% container)`,
    );
  }
}

analyzeChapters();
