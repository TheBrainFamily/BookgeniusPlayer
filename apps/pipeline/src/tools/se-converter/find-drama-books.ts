#!/usr/bin/env bun
/**
 * Categorize drama/play books in the Standard Ebooks collection
 *
 * Categories:
 * - FULL_PLAY: Entire book is a play (acts/scenes structure, dramatis-personae)
 * - EMBEDDED_DRAMA: Regular prose with embedded drama sections (<table epub:type="z3998:drama">)
 * - DIALOGUE_ONLY: Uses z3998:persona for dialogue but not dramatic structure
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const BOOKS_DIR = join(import.meta.dir, "../../../standardebooks-data/books");
const OUTPUT_FILE = join(import.meta.dir, "../../../list-of-play-books.txt");

type BookCategory = "FULL_PLAY" | "EMBEDDED_DRAMA" | "DIALOGUE_ONLY";

interface BookAnalysis {
  slug: string;
  category: BookCategory;
  hasDramatisPersonae: boolean;
  hasActFiles: boolean;
  hasSceneSections: boolean;
  hasDramaTables: boolean;
  actCount: number;
  dramaTables: number;
  regularParagraphs: number;
  notes: string[];
}

async function analyzeBook(bookSlug: string): Promise<BookAnalysis | null> {
  const textDir = join(BOOKS_DIR, bookSlug, "text");

  try {
    const files = await readdir(textDir);
    const xhtmlFiles = files.filter((f) => f.endsWith(".xhtml"));

    const analysis: BookAnalysis = {
      slug: bookSlug,
      category: "DIALOGUE_ONLY",
      hasDramatisPersonae: files.includes("dramatis-personae.xhtml"),
      hasActFiles: files.some((f) => /^act-\d+\.xhtml$/.test(f)),
      hasSceneSections: false,
      hasDramaTables: false,
      actCount: files.filter((f) => /^act-\d+\.xhtml$/.test(f)).length,
      dramaTables: 0,
      regularParagraphs: 0,
      notes: [],
    };

    let hasAnyDramaContent = false;

    for (const file of xhtmlFiles) {
      const content = await Bun.file(join(textDir, file)).text();

      // Count drama tables (embedded drama sections)
      const dramaTableMatches = content.match(/<table[^>]*epub:type="z3998:drama"/g);
      if (dramaTableMatches) {
        analysis.dramaTables += dramaTableMatches.length;
        analysis.hasDramaTables = true;
        hasAnyDramaContent = true;
      }

      // Check for scene sections (full play indicator)
      if (
        content.includes('epub:type="z3998:scene"') ||
        content.includes("epub:type='z3998:scene'")
      ) {
        analysis.hasSceneSections = true;
        hasAnyDramaContent = true;
      }

      // Count regular paragraphs (outside of drama context)
      // Skip dramatis-personae, endnotes, etc
      if (
        ![
          "dramatis-personae.xhtml",
          "endnotes.xhtml",
          "colophon.xhtml",
          "imprint.xhtml",
          "titlepage.xhtml",
          "halftitlepage.xhtml",
        ].includes(file)
      ) {
        const paragraphs = content.match(/<p[^>]*>/g);
        if (paragraphs) {
          analysis.regularParagraphs += paragraphs.length;
        }
      }

      // Check for stage directions (another indicator)
      if (content.includes('epub:type="z3998:stage-direction"')) {
        hasAnyDramaContent = true;
      }
    }

    if (!hasAnyDramaContent && !analysis.hasDramatisPersonae && !analysis.hasActFiles) {
      return null; // Not a drama book
    }

    // Categorize
    if (analysis.hasDramatisPersonae && analysis.hasActFiles && analysis.hasSceneSections) {
      analysis.category = "FULL_PLAY";
      analysis.notes.push("Classic play structure");
    } else if (analysis.hasDramatisPersonae && analysis.hasActFiles) {
      analysis.category = "FULL_PLAY";
      analysis.notes.push("Has acts and dramatis-personae");
    } else if (analysis.hasSceneSections && analysis.actCount > 0) {
      analysis.category = "FULL_PLAY";
      analysis.notes.push("Scene-based structure");
    } else if (analysis.hasDramaTables) {
      // Has <table epub:type="z3998:drama"> embedded in prose
      if (analysis.regularParagraphs > 100 && analysis.dramaTables < 20) {
        analysis.category = "EMBEDDED_DRAMA";
        analysis.notes.push(
          `${analysis.dramaTables} drama tables in ${analysis.regularParagraphs} paragraphs of prose`,
        );
      } else if (analysis.dramaTables > 50) {
        analysis.category = "FULL_PLAY";
        analysis.notes.push("Primarily drama tables");
      } else {
        analysis.category = "EMBEDDED_DRAMA";
        analysis.notes.push(`Mixed content: ${analysis.dramaTables} drama sections`);
      }
    } else if (analysis.hasDramatisPersonae) {
      analysis.category = "FULL_PLAY";
      analysis.notes.push("Has dramatis-personae only");
    } else {
      analysis.category = "DIALOGUE_ONLY";
      analysis.notes.push("Uses persona markup but not structured drama");
    }

    return analysis;
  } catch {
    return null;
  }
}

async function findDramaBooks() {
  const bookDirs = await readdir(BOOKS_DIR);

  const fullPlays: BookAnalysis[] = [];
  const embeddedDrama: BookAnalysis[] = [];
  const dialogueOnly: BookAnalysis[] = [];

  for (const bookSlug of bookDirs) {
    const analysis = await analyzeBook(bookSlug);
    if (analysis) {
      switch (analysis.category) {
        case "FULL_PLAY":
          fullPlays.push(analysis);
          break;
        case "EMBEDDED_DRAMA":
          embeddedDrama.push(analysis);
          break;
        case "DIALOGUE_ONLY":
          dialogueOnly.push(analysis);
          break;
      }
    }
  }

  // Sort all by slug
  fullPlays.sort((a, b) => a.slug.localeCompare(b.slug));
  embeddedDrama.sort((a, b) => a.slug.localeCompare(b.slug));
  dialogueOnly.sort((a, b) => a.slug.localeCompare(b.slug));

  // Write output
  const lines = [
    `# Drama/Play Books in Standard Ebooks Collection`,
    `# Generated: ${new Date().toISOString()}`,
    `#`,
    `# Categories:`,
    `#   FULL_PLAY - Entire book is a play (use play UI throughout)`,
    `#   EMBEDDED_DRAMA - Prose with embedded drama sections (switch to play UI for those sections)`,
    `#   DIALOGUE_ONLY - Uses persona markup but not structured drama (ignore)`,
    ``,
    `================================================================================`,
    `FULL_PLAY (${fullPlays.length} books) - Render entirely in play format`,
    `================================================================================`,
    ...fullPlays.map((b) => `${b.slug}${b.notes.length ? `  # ${b.notes.join(", ")}` : ""}`),
    ``,
    `================================================================================`,
    `EMBEDDED_DRAMA (${embeddedDrama.length} books) - Has drama sections within prose`,
    `================================================================================`,
    ...embeddedDrama.map((b) => `${b.slug}  # ${b.notes.join(", ")}`),
    ``,
    `================================================================================`,
    `DIALOGUE_ONLY (${dialogueOnly.length} books) - Not real drama structure`,
    `================================================================================`,
    ...dialogueOnly.map((b) => b.slug),
  ];

  await Bun.write(OUTPUT_FILE, lines.join("\n"));

  console.log(`\nResults written to: ${OUTPUT_FILE}`);
  console.log(`\nSummary:`);
  console.log(`  FULL_PLAY:      ${fullPlays.length} books (use play UI throughout)`);
  console.log(`  EMBEDDED_DRAMA: ${embeddedDrama.length} books (switch UI for drama sections)`);
  console.log(`  DIALOGUE_ONLY:  ${dialogueOnly.length} books (regular rendering)`);

  // Show some examples
  console.log(`\n--- Sample FULL_PLAY books ---`);
  fullPlays.slice(0, 10).forEach((b) => console.log(`  ${b.slug}`));

  console.log(`\n--- Sample EMBEDDED_DRAMA books ---`);
  embeddedDrama.slice(0, 10).forEach((b) => console.log(`  ${b.slug} (${b.notes.join(", ")})`));
}

findDramaBooks().catch(console.error);
