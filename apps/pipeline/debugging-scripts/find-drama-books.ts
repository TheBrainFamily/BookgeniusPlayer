#!/usr/bin/env bun

/**
 * Categorize drama/play books in the Standard Ebooks collection
 *
 * Categories:
 * - FULL_PLAY: Entire book is a play (must have acts+scenes OR drama tables as main content)
 * - EMBEDDED_DRAMA: Regular prose with embedded drama sections (<table epub:type="z3998:drama">)
 * - HAS_CHARACTER_LIST: Has dramatis-personae but is a novel (just lists characters)
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
const BOOKS_DIR = join(import.meta.dir, "../standardebooks-data/books");
const OUTPUT_FILE = join(import.meta.dir, "./list-of-play-books-2.txt");
type BookCategory = "FULL_PLAY" | "EMBEDDED_DRAMA" | "HAS_CHARACTER_LIST";
interface BookAnalysis {
  slug: string;
  category: BookCategory;
  hasDramatisPersonae: boolean;
  hasActFiles: boolean;
  hasSceneSections: boolean;
  hasDramaTables: boolean;
  hasStageDirections: boolean;
  actCount: number;
  chapterCount: number;
  dramaTables: number;
  regularParagraphs: number;
  dialogueRows: number; // <tr> in drama tables
  notes: string[];
}
// eslint-disable-next-line complexity
async function analyzeBook(bookSlug: string): Promise<BookAnalysis | null> {
  const textDir = join(BOOKS_DIR, bookSlug, "text");

  try {
    const files = await readdir(textDir);
    const xhtmlFiles = files.filter((f) => f.endsWith(".xhtml"));

    const analysis: BookAnalysis = {
      slug: bookSlug,
      category: "HAS_CHARACTER_LIST",
      hasDramatisPersonae: files.includes("dramatis-personae.xhtml"),
      hasActFiles: files.some((f) => /^act-\d+\.xhtml$/.test(f)),
      hasSceneSections: false,
      hasDramaTables: false,
      hasStageDirections: false,
      actCount: files.filter((f) => /^act-\d+\.xhtml$/.test(f)).length,
      chapterCount: files.filter((f) => /^chapter-/.test(f)).length,
      dramaTables: 0,
      regularParagraphs: 0,
      dialogueRows: 0,
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

      // Count dialogue rows in drama tables
      const dialogueRowMatches = content.match(/<tr>/g);
      if (dialogueRowMatches && content.includes("z3998:drama")) {
        analysis.dialogueRows += dialogueRowMatches.length;
      }

      // Check for scene sections (full play indicator)
      if (
        content.includes('epub:type="z3998:scene"') ||
        content.includes("epub:type='z3998:scene'")
      ) {
        analysis.hasSceneSections = true;
        hasAnyDramaContent = true;
      }

      // Check for stage directions
      if (content.includes('epub:type="z3998:stage-direction"')) {
        analysis.hasStageDirections = true;
        hasAnyDramaContent = true;
      }

      // Count regular paragraphs (excluding metadata files)
      if (
        ![
          "dramatis-personae.xhtml",
          "endnotes.xhtml",
          "colophon.xhtml",
          "imprint.xhtml",
          "titlepage.xhtml",
          "halftitlepage.xhtml",
          "loi.xhtml",
        ].includes(file)
      ) {
        const paragraphs = content.match(/<p[^>]*>/g);
        if (paragraphs) {
          analysis.regularParagraphs += paragraphs.length;
        }
      }
    }

    // Skip books with no drama indicators at all
    if (!hasAnyDramaContent && !analysis.hasDramatisPersonae) {
      return null;
    }

    // Categorize with STRICTER rules
    const isLikelyPlay =
      // Has act files (act-1.xhtml, etc.) - strong indicator
      analysis.hasActFiles ||
      // Has scene sections - strong indicator
      analysis.hasSceneSections ||
      // Primary content is dialogue rows (more dialogue than paragraphs)
      (analysis.dialogueRows > analysis.regularParagraphs * 0.5 && analysis.dialogueRows > 50);

    if (isLikelyPlay && (analysis.hasDramatisPersonae || analysis.hasStageDirections)) {
      analysis.category = "FULL_PLAY";
      if (analysis.hasActFiles && analysis.hasSceneSections) {
        analysis.notes.push(`${analysis.actCount} acts with scenes`);
      } else if (analysis.hasActFiles) {
        analysis.notes.push(`${analysis.actCount} acts`);
      } else if (analysis.hasSceneSections) {
        analysis.notes.push("Scene-based structure");
      } else {
        analysis.notes.push(`${analysis.dialogueRows} dialogue rows`);
      }
    } else if (analysis.hasDramaTables && analysis.chapterCount > 0) {
      // Has chapters AND drama tables = novel with embedded drama
      analysis.category = "EMBEDDED_DRAMA";
      analysis.notes.push(
        `${analysis.dramaTables} drama sections in ${analysis.chapterCount}-chapter book`,
      );
    } else if (analysis.hasDramaTables && analysis.regularParagraphs > analysis.dialogueRows * 2) {
      // More prose than dialogue = embedded drama
      analysis.category = "EMBEDDED_DRAMA";
      analysis.notes.push(
        `${analysis.dramaTables} drama tables, ${analysis.regularParagraphs} paragraphs`,
      );
    } else if (analysis.hasDramaTables && analysis.dialogueRows > 100) {
      // Mostly drama content
      analysis.category = "FULL_PLAY";
      analysis.notes.push(`Drama table format, ${analysis.dialogueRows} dialogue rows`);
    } else if (analysis.hasDramatisPersonae && !analysis.hasActFiles && analysis.chapterCount > 0) {
      // Has chapters but no acts = novel with character list
      analysis.category = "HAS_CHARACTER_LIST";
      analysis.notes.push(`Novel with ${analysis.chapterCount} chapters`);
    } else if (analysis.hasDramatisPersonae) {
      // Just has dramatis-personae, needs manual check
      analysis.category = "HAS_CHARACTER_LIST";
      analysis.notes.push("Needs manual verification");
    } else if (analysis.hasDramaTables) {
      analysis.category = "EMBEDDED_DRAMA";
      analysis.notes.push(`${analysis.dramaTables} drama tables`);
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
  const hasCharacterList: BookAnalysis[] = [];

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
        case "HAS_CHARACTER_LIST":
          hasCharacterList.push(analysis);
          break;
      }
    }
  }

  // Sort all by slug
  fullPlays.sort((a, b) => a.slug.localeCompare(b.slug));
  embeddedDrama.sort((a, b) => a.slug.localeCompare(b.slug));
  hasCharacterList.sort((a, b) => a.slug.localeCompare(b.slug));
  // Write output
  const lines = [
    `# Drama/Play Books in Standard Ebooks Collection`,
    `# Generated: ${new Date().toISOString()}`,
    `#`,
    `# Categories:`,
    `#   FULL_PLAY - Entire book is a play (use play UI throughout)`,
    `#   EMBEDDED_DRAMA - Prose with embedded drama sections (switch to play UI for those sections)`,
    `#   HAS_CHARACTER_LIST - Novel that just has a character list (ignore, render normally)`,
    ``,
    `================================================================================`,
    `FULL_PLAY (${fullPlays.length} books) - Render entirely in play format`,
    `================================================================================`,
    ...fullPlays.map((b) => `${b.slug}  # ${b.notes.join(", ")}`),
    ``,
    `================================================================================`,
    `EMBEDDED_DRAMA (${embeddedDrama.length} books) - Has drama sections within prose`,
    `================================================================================`,
    ...embeddedDrama.map((b) => `${b.slug}  # ${b.notes.join(", ")}`),
    ``,
    `================================================================================`,
    `HAS_CHARACTER_LIST (${hasCharacterList.length} books) - Novels with character lists (not plays)`,
    `================================================================================`,
    ...hasCharacterList.map((b) => `${b.slug}  # ${b.notes.join(", ")}`),
  ];
  await Bun.write(OUTPUT_FILE, lines.join("\n"));

  console.log(`\nResults written to: ${OUTPUT_FILE}`);
  console.log(`\nSummary:`);
  console.log(`  FULL_PLAY:          ${fullPlays.length} books (use play UI throughout)`);
  console.log(`  EMBEDDED_DRAMA:     ${embeddedDrama.length} books (switch UI for drama sections)`);
  console.log(`  HAS_CHARACTER_LIST: ${hasCharacterList.length} books (novels, render normally)`);
}
findDramaBooks().catch(console.error);
