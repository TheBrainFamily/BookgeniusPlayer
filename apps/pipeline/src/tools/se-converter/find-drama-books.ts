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
import { analyzeBook, type BookAnalysis } from "./drama-classifier";

const BOOKS_DIR = join(import.meta.dir, "../../../standardebooks-data/books");
const OUTPUT_FILE = join(import.meta.dir, "../../../list-of-play-books.txt");

type BookCategory = "FULL_PLAY" | "EMBEDDED_DRAMA" | "DIALOGUE_ONLY";

async function findDramaBooks() {
  const bookDirs = await readdir(BOOKS_DIR);

  const fullPlays: BookAnalysis[] = [];
  const embeddedDrama: BookAnalysis[] = [];
  const dialogueOnly: BookAnalysis[] = [];

  for (const bookSlug of bookDirs) {
    const analysis = await analyzeBook(bookSlug, BOOKS_DIR);
    if (analysis) {
      switch (analysis.category as BookCategory) {
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
