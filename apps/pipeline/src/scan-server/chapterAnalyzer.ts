import { callGeminiWithThinkingAndSchemaAndParsed } from "../callFastGemini";
import type { DetectedChapter } from "./chapterDetector";
import {
  ChapterAnalysisSchema,
  type ChapterAnalysis,
  type BookAnalysis,
  type ChapterCharacter,
  type BookCharacter,
} from "./ocrSchema";

/**
 * Retry helper with provider rotation and exponential backoff
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.error(`[ChapterAnalyzer] Attempt ${attempt + 1} failed:`, error);
      if (attempt === maxAttempts - 1) throw error;
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw new Error("All retry attempts failed");
}

/**
 * Build the prompt for analyzing a single chapter
 */
function buildChapterAnalysisPrompt(
  chapter: DetectedChapter,
  previousSummaries: string,
  previousCharacters: ChapterCharacter[],
): string {
  // Combine all page text for this chapter
  const chapterText = chapter.pages.map((p) => p.text).join("\n\n");

  const knownCharactersJson =
    previousCharacters.length > 0
      ? JSON.stringify(
          previousCharacters.map((c) => ({
            name: c.name,
            slug: c.slug,
            referenceCard: c.referenceCard,
          })),
          null,
          2,
        )
      : "(No characters yet - this is the first chapter)";

  return `You are analyzing a fiction book chapter by chapter.

## Previous Chapters Summary:
${previousSummaries || "(This is the first chapter)"}

## Known Characters (REUSE these slugs if the same person appears):
${knownCharactersJson}

## Chapter ${chapter.chapterNumber}${chapter.title ? ` - "${chapter.title}"` : ""} Text:

${chapterText}

## Instructions:

1. **Summary**: Write a concise summary (telegram-style - short sentences, pack information densely).
   - Mention character names explicitly
   - Follow chronological flow of events
   - Show continuity with previous chapters if applicable

2. **Characters**: List ALL characters that appear in this chapter:
   - If a character matches a known one (same person, even by different name/title/role like "sister", "doctor", "mother"), use the SAME slug
   - For new characters, create a new kebab-case slug from their name
   - Set \`mentioned: true\` if they appear in the narrative
   - Set \`speaking: true\` if they have dialogue (spoken words)

   For each character, provide TWO descriptions:
   - **referenceCard**: A spoiler-free 1-2 sentence bio describing WHO this person is (their role, relationship to others).
     - For NEW characters: Write a fresh bio based on their introduction
     - For RETURNING characters: Copy the exact referenceCard from the known characters list
   - **chapterAction**: 1-2 sentences describing what this character DOES or EXPERIENCES in THIS SPECIFIC CHAPTER (their actions, events, significance in this chapter only)

IMPORTANT: Reply in the language of the book text. If the book is in Polish, reply in Polish. If English, reply in English.

Return JSON matching the schema.`;
}

/**
 * Analyze a single chapter using AI
 */
async function analyzeChapter(
  chapter: DetectedChapter,
  previousSummaries: string,
  previousCharacters: ChapterCharacter[],
): Promise<ChapterAnalysis> {
  const prompt = buildChapterAnalysisPrompt(chapter, previousSummaries, previousCharacters);

  const result = await callGeminiWithThinkingAndSchemaAndParsed(
    prompt,
    ChapterAnalysisSchema,
    "gemini-3-flash-preview",
  );

  // Ensure chapterNumber matches
  return { ...result, chapterNumber: chapter.chapterNumber };
}

/**
 * Merge new chapter's characters into the accumulated list
 * Keeps track of which chapters each character appeared in
 */
function mergeCharacters(
  existingCharacters: ChapterCharacter[],
  newCharacters: ChapterCharacter[],
): ChapterCharacter[] {
  const merged = [...existingCharacters];

  for (const newChar of newCharacters) {
    const existing = merged.find((c) => c.slug === newChar.slug);
    if (!existing) {
      merged.push(newChar);
    } else {
      // Update referenceCard if new one is longer/more detailed
      if (newChar.referenceCard.length > existing.referenceCard.length) {
        existing.referenceCard = newChar.referenceCard;
      }
    }
  }

  return merged;
}

/**
 * Build the final character index from all chapter results
 */
function buildCharacterIndex(chapterResults: ChapterAnalysis[]): BookCharacter[] {
  const characterMap = new Map<
    string,
    {
      name: string;
      slug: string;
      referenceCard: string;
      firstSeenChapter: number;
      chaptersAppeared: number[];
      chaptersSpeaking: number[];
    }
  >();

  for (const chapter of chapterResults) {
    for (const char of chapter.characters) {
      if (!characterMap.has(char.slug)) {
        characterMap.set(char.slug, {
          name: char.name,
          slug: char.slug,
          referenceCard: char.referenceCard,
          firstSeenChapter: chapter.chapterNumber,
          chaptersAppeared: [],
          chaptersSpeaking: [],
        });
      }

      const entry = characterMap.get(char.slug)!;

      if (char.mentioned && !entry.chaptersAppeared.includes(chapter.chapterNumber)) {
        entry.chaptersAppeared.push(chapter.chapterNumber);
      }

      if (char.speaking && !entry.chaptersSpeaking.includes(chapter.chapterNumber)) {
        entry.chaptersSpeaking.push(chapter.chapterNumber);
      }

      // Keep the longest/most detailed referenceCard
      if (char.referenceCard.length > entry.referenceCard.length) {
        entry.referenceCard = char.referenceCard;
      }
    }
  }

  return Array.from(characterMap.values());
}

/**
 * Main entry point: Analyze all chapters in a rolling fashion
 * Each chapter receives context from previous chapters to maintain consistent character slugs
 */
export async function analyzeChaptersRolling(chapters: DetectedChapter[]): Promise<BookAnalysis> {
  let previousSummaries = "";
  let previousCharacters: ChapterCharacter[] = [];
  const chapterResults: ChapterAnalysis[] = [];

  console.log(`[ChapterAnalyzer] Starting analysis of ${chapters.length} chapters...`);

  for (const chapter of chapters) {
    console.log(`[ChapterAnalyzer] Analyzing chapter ${chapter.chapterNumber}...`);

    const result = await withRetry(() =>
      analyzeChapter(chapter, previousSummaries, previousCharacters),
    );

    chapterResults.push(result);

    // Accumulate context for next chapter
    previousSummaries += `\n\n### Chapter ${chapter.chapterNumber}\n${result.summary}`;
    previousCharacters = mergeCharacters(previousCharacters, result.characters);

    console.log(
      `[ChapterAnalyzer] Chapter ${chapter.chapterNumber}: ${result.characters.length} characters, summary length: ${result.summary.length}`,
    );
  }

  const allCharacters = buildCharacterIndex(chapterResults);

  console.log(
    `[ChapterAnalyzer] Analysis complete: ${chapterResults.length} chapters, ${allCharacters.length} unique characters`,
  );

  return { chapters: chapterResults, allCharacters };
}

/**
 * Generate a summary of the analysis for logging
 */
export function summarizeAnalysis(analysis: BookAnalysis): string {
  const lines: string[] = [
    `Book Analysis: ${analysis.chapters.length} chapters, ${analysis.allCharacters.length} characters`,
    "",
    "Characters:",
  ];

  for (const char of analysis.allCharacters) {
    lines.push(
      `  - ${char.name} (${char.slug}): first seen ch${char.firstSeenChapter}, appears in ${char.chaptersAppeared.length} chapters, speaks in ${char.chaptersSpeaking.length}`,
    );
  }

  lines.push("");
  lines.push("Chapter summaries:");

  for (const chapter of analysis.chapters) {
    const preview = chapter.summary.slice(0, 100) + (chapter.summary.length > 100 ? "..." : "");
    lines.push(`  Ch${chapter.chapterNumber}: ${preview}`);
  }

  return lines.join("\n");
}
