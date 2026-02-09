/**
 * Build old → new paragraph index mappings for a book.
 * Uses content similarity to auto-match indices.
 */

import { getParagraphsFromChapterWithText } from "../getParagraphsFromChapterWithText";
import { readBookFile } from "../../helpers/readBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import type { ParagraphInfo, IndexMapping, ChapterMigration, CueSnapshot } from "./types";

/**
 * Calculate text similarity (0-1) using longest common substring ratio
 */
function calculateSimilarity(text1: string, text2: string): number {
  const shorter = text1.length < text2.length ? text1 : text2;
  const longer = text1.length < text2.length ? text2 : text1;

  if (shorter.length === 0) return 0;

  // Simple approach: check if shorter is contained in longer
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  // Check if first 50 chars match
  const prefix1 = text1.slice(0, 50).trim();
  const prefix2 = text2.slice(0, 50).trim();

  if (prefix1 === prefix2 && prefix1.length > 10) {
    return 0.9; // High confidence if prefixes match
  }

  // Fallback: word overlap
  const words1 = new Set(shorter.toLowerCase().split(/\s+/));
  const words2 = new Set(longer.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter((w) => words2.has(w)));

  return intersection.size / Math.max(words1.size, words2.size);
}

/**
 * Extract paragraph info with content hashes
 */
function extractParagraphInfo(
  chapter: number,
  bookText: string,
  clean: boolean = true,
  pureText: boolean = true,
): ParagraphInfo[] {
  const paragraphs = getParagraphsFromChapterWithText(chapter, bookText, clean, pureText);

  return paragraphs.map((p) => ({
    dataIndex: p.dataIndex,
    text: p.text,
    elementType: p.elementType,
    contentHash: p.text.slice(0, 100).trim(),
  }));
}

/**
 * Match old indices to new indices using content similarity
 */
function buildMappings(
  oldParagraphs: ParagraphInfo[],
  newParagraphs: ParagraphInfo[],
): IndexMapping[] {
  const mappings: IndexMapping[] = [];

  for (const oldP of oldParagraphs) {
    let bestMatch = {
      newIndex: -1,
      similarity: 0,
      newContent: "",
    };

    // Try to find best matching new paragraph
    for (const newP of newParagraphs) {
      const sim = calculateSimilarity(oldP.text, newP.text);

      if (sim > bestMatch.similarity) {
        bestMatch = {
          newIndex: newP.dataIndex,
          similarity: sim,
          newContent: newP.text,
        };
      }
    }

    // Determine confidence level
    let confidence: "exact" | "fuzzy" | "manual" | "unmapped";
    if (bestMatch.similarity === 1.0) {
      confidence = "exact";
    } else if (bestMatch.similarity > 0.8) {
      confidence = "fuzzy";
    } else if (bestMatch.similarity > 0) {
      confidence = "manual";
    } else {
      confidence = "unmapped";
    }

    mappings.push({
      oldIndex: oldP.dataIndex,
      newIndex: bestMatch.newIndex,
      confidence,
      oldContent: oldP.text,
      newContent: bestMatch.newContent,
      similarity: bestMatch.similarity,
    });
  }

  return mappings;
}

/**
 * Build migration plan for a single chapter
 */
export function buildChapterMigration(
  chapter: number,
  bookText: string,
  cuesInChapter: CueSnapshot[],
): ChapterMigration {
  console.log(`  📍 Chapter ${chapter}: analyzing ${cuesInChapter.length} cues...`);

  const oldParagraphs = extractParagraphInfo(chapter, bookText, true, true);

  // TODO: Replace with new extraction logic once implemented
  // For now, using same logic (will fail test but shows the pattern)
  const newParagraphs = extractParagraphInfo(chapter, bookText, true, true);

  const mappings = buildMappings(oldParagraphs, newParagraphs);

  // Filter to only affected cues (at indices that changed)
  const affectedCues = cuesInChapter.filter((cue) => {
    const mapping = mappings.find((m) => m.oldIndex === cue.paragraph);
    return mapping && mapping.newIndex !== mapping.oldIndex;
  });

  console.log(
    `     ${affectedCues.length} cues need remapping (${mappings.filter((m) => m.confidence === "exact").length} exact, ` +
      `${mappings.filter((m) => m.confidence === "fuzzy").length} fuzzy, ` +
      `${mappings.filter((m) => m.confidence === "manual").length} manual)`,
  );

  return {
    chapter,
    oldParagraphs,
    newParagraphs,
    mappings,
    affectedCues,
  };
}

/**
 * Build migration plan for entire book
 */
export async function buildBookMigrationPlan(
  bookSlug: string,
  allCues: CueSnapshot[],
  snapshotPath: string,
): Promise<any> {
  console.log(`\n🔄 Building migration plan for ${bookSlug}...`);

  // Load book text
  const bookText = readBookFile(`${bookSlug}-compiled.html`, FILE_TYPE.TEMPORARY);

  // Group cues by chapter
  const cuesByChapter = new Map<number, CueSnapshot[]>();
  for (const cue of allCues) {
    const existing = cuesByChapter.get(cue.chapter) || [];
    existing.push(cue);
    cuesByChapter.set(cue.chapter, existing);
  }

  // Build migration for each chapter
  const chapters: ChapterMigration[] = [];
  for (const [chapter, cues] of cuesByChapter.entries()) {
    const migration = buildChapterMigration(chapter, bookText, cues);
    chapters.push(migration);
  }

  return {
    bookPath: `books/${bookSlug}`,
    bookSlug,
    timestamp: Date.now(),
    chapters,
    totalCues: allCues.length,
    snapshotPath,
  };
}
