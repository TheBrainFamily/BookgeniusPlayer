#!/usr/bin/env bun
/**
 * Analyze SE books for content/formatting that could be lost during conversion
 * V2 - More precise detection
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
const BOOKS_DIR = join(import.meta.dir, "../../../standardebooks-data/books");
const OUTPUT_FILE = join(import.meta.dir, "../../../content-loss-analysis.txt");
interface ContentRisk {
  type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  files: string[];
  examples: string[];
}
interface BookAnalysis {
  slug: string;
  risks: ContentRisk[];
}
async function analyzeBook(bookSlug: string): Promise<BookAnalysis | null> {
  const textDir = join(BOOKS_DIR, bookSlug, "text");
  const risks: ContentRisk[] = [];

  try {
    const files = await readdir(textDir);
    const xhtmlFiles = files.filter((f) => f.endsWith(".xhtml"));
    const isFullPlay = files.some((f) => /^act-\d+\.xhtml$/.test(f)) && files.includes("dramatis-personae.xhtml");

    for (const file of xhtmlFiles) {
      const content = await Bun.file(join(textDir, file)).text();

      // === CRITICAL: Embedded drama tables (NOT in full plays) ===
      if (!isFullPlay) {
        const dramaTables = content.match(/<table[^>]*epub:type="z3998:drama"[\s\S]*?<\/table>/g);
        if (dramaTables) {
          const existing = risks.find((r) => r.type === "EMBEDDED_DRAMA_TABLE");
          if (existing) {
            existing.files.push(file);
          } else {
            risks.push({
              type: "EMBEDDED_DRAMA_TABLE",
              severity: "CRITICAL",
              description: "Drama dialogue in <table> needs conversion to data-speaker",
              files: [file],
              examples: [dramaTables[0].slice(0, 300)],
            });
          }
        }
      }

      // === CRITICAL: Part files with REAL prose (not just titles/bridgeheads) ===
      if (/^(part|book|volume)-?\d*\.xhtml$/.test(file)) {
        // Look for actual narrative paragraphs (not titles, not bridgeheads, not epigraphs)
        // Real prose usually has >50 chars and doesn't start with chapter/book titles
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/);
        if (bodyMatch) {
          const body = bodyMatch[1];
          // Remove headers, titles, bridgeheads, epigraphs
          const withoutMeta = body
            .replace(/<header[\s\S]*?<\/header>/g, "")
            .replace(/<blockquote[^>]*epub:type="[^"]*epigraph[\s\S]*?<\/blockquote>/g, "")
            .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/g, "")
            .replace(/<p[^>]*epub:type="[^"]*(?:bridgehead|title)[^"]*"[^>]*>[\s\S]*?<\/p>/g, "");

          // Count remaining paragraphs with substantial text
          const realParagraphs = withoutMeta.match(/<p[^>]*>[^<]{50,}/g);
          if (realParagraphs && realParagraphs.length > 0) {
            risks.push({
              type: "PART_WITH_REAL_PROSE",
              severity: "CRITICAL",
              description: `Part file has ${realParagraphs.length} real prose paragraphs`,
              files: [file],
              examples: realParagraphs.slice(0, 1).map((p) => p.slice(0, 150)),
            });
          }
        }
      }

      // === CRITICAL: Interlude files with content ===
      if (/interlude/i.test(file)) {
        const paragraphs = (content.match(/<p[^>]*>[^<]{30,}/g) || []).length;
        if (paragraphs > 2) {
          risks.push({ type: "INTERLUDE_CONTENT", severity: "CRITICAL", description: `Interlude with ${paragraphs} paragraphs needs own chapter`, files: [file], examples: [] });
        }
      }

      // === HIGH: Preamble content before nested chapters ===
      // Pattern: <section><p>text</p>...<section epub:type="chapter">
      const preambleMatch = content.match(/<section[^>]*>[\s\S]*?<p[^>]*>[^<]{30,}[\s\S]*?<section[^>]*epub:type="[^"]*chapter/g);
      if (preambleMatch) {
        risks.push({ type: "PREAMBLE_BEFORE_NESTED", severity: "HIGH", description: "Content before nested chapters may be lost during promotion", files: [file], examples: [] });
      }

      // === MEDIUM: Poetry/verse that needs formatting ===
      const poemBlocks = content.match(/<(?:blockquote|div|section)[^>]*epub:type="[^"]*z3998:(?:poem|verse|song)[^"]*"[\s\S]*?<\/(?:blockquote|div|section)>/g);
      if (poemBlocks && poemBlocks.length > 0) {
        const existing = risks.find((r) => r.type === "POETRY_BLOCKS");
        if (existing) {
          existing.files.push(file);
          existing.description = `${parseInt(existing.description) + poemBlocks.length} poem blocks need line formatting`;
        } else {
          risks.push({ type: "POETRY_BLOCKS", severity: "MEDIUM", description: `${poemBlocks.length} poem blocks need line formatting`, files: [file], examples: [] });
        }
      }

      // === MEDIUM: Images/figures ===
      const figures = content.match(/<figure[^>]*>[\s\S]*?<img[^>]*>[\s\S]*?<\/figure>/g);
      if (figures) {
        const existing = risks.find((r) => r.type === "FIGURES_IMAGES");
        if (existing) {
          existing.files.push(file);
        } else {
          risks.push({ type: "FIGURES_IMAGES", severity: "MEDIUM", description: `${figures.length} figures with images`, files: [file], examples: [] });
        }
      }

      // === MEDIUM: Data tables (not drama) ===
      const dataTables = content.match(/<table(?![^>]*z3998:drama)[^>]*>(?![\s\S]*?z3998:persona)[\s\S]*?<\/table>/g);
      if (dataTables) {
        const existing = risks.find((r) => r.type === "DATA_TABLES");
        if (existing) {
          existing.files.push(file);
        } else {
          risks.push({ type: "DATA_TABLES", severity: "MEDIUM", description: `${dataTables.length} data tables`, files: [file], examples: [] });
        }
      }

      // === LOW: Stage directions in non-play ===
      if (!isFullPlay) {
        const stageCount = (content.match(/epub:type="z3998:stage-direction"/g) || []).length;
        if (stageCount > 0) {
          const existing = risks.find((r) => r.type === "STAGE_DIRECTIONS");
          if (existing) {
            existing.files.push(file);
          } else {
            risks.push({ type: "STAGE_DIRECTIONS", severity: "LOW", description: `${stageCount} stage directions need italic styling`, files: [file], examples: [] });
          }
        }
      }
    }

    if (risks.length === 0) return null;
    return { slug: bookSlug, risks };
  } catch {
    return null;
  }
}
async function main() {
  const bookDirs = await readdir(BOOKS_DIR);

  const byCategory: Record<string, BookAnalysis[]> = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
  const riskCounts: Record<string, number> = {};

  for (const bookSlug of bookDirs) {
    const analysis = await analyzeBook(bookSlug);
    if (!analysis) continue;

    for (const risk of analysis.risks) {
      riskCounts[risk.type] = (riskCounts[risk.type] || 0) + 1;
    }

    const maxSeverity = analysis.risks.reduce((max, r) => {
      const order: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return order[r.severity] > order[max] ? r.severity : max;
    }, "LOW");

    byCategory[maxSeverity].push(analysis);
  }

  // Sort
  Object.values(byCategory).forEach((arr) => arr.sort((a, b) => a.slug.localeCompare(b.slug)));

  const lines = [
    `# Content Loss Risk Analysis for SE Books (v2)`,
    `# Generated: ${new Date().toISOString()}`,
    ``,
    `================================================================================`,
    `SUMMARY`,
    `================================================================================`,
    `CRITICAL: ${byCategory.CRITICAL.length} books`,
    `HIGH:     ${byCategory.HIGH.length} books`,
    `MEDIUM:   ${byCategory.MEDIUM.length} books`,
    `LOW:      ${byCategory.LOW.length} books`,
    ``,
    `Risk types:`,
    ...Object.entries(riskCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `  ${t}: ${c}`),
    ``,
    `================================================================================`,
    `CRITICAL ISSUES (${byCategory.CRITICAL.length} books)`,
    `================================================================================`,
  ];

  for (const book of byCategory.CRITICAL) {
    const critical = book.risks.filter((r) => r.severity === "CRITICAL");
    lines.push(`\n${book.slug}`);
    for (const r of critical) {
      lines.push(`  [${r.type}] ${r.description}`);
      lines.push(`    Files: ${r.files.join(", ")}`);
      if (r.examples[0]) lines.push(`    Sample: ${r.examples[0].replace(/\s+/g, " ").slice(0, 120)}...`);
    }
  }

  lines.push(
    ``,
    `================================================================================`,
    `HIGH ISSUES (${byCategory.HIGH.length} books)`,
    `================================================================================`,
  );
  for (const book of byCategory.HIGH) {
    lines.push(
      `${book.slug}: ${book.risks
        .filter((r) => r.severity === "HIGH")
        .map((r) => r.type)
        .join(", ")}`,
    );
  }

  await Bun.write(OUTPUT_FILE, lines.join("\n"));

  console.log(`\n✅ Analysis complete → ${OUTPUT_FILE}`);
  console.log(`\nSUMMARY:`);
  console.log(`  CRITICAL: ${byCategory.CRITICAL.length}`);
  console.log(`  HIGH:     ${byCategory.HIGH.length}`);
  console.log(`  MEDIUM:   ${byCategory.MEDIUM.length}`);
  console.log(`  LOW:      ${byCategory.LOW.length}`);
  console.log(`\nRisk breakdown:`);
  Object.entries(riskCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, c]) => console.log(`  ${t}: ${c}`));
}
main().catch(console.error);
