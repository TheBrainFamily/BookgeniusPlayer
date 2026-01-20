/**
 * chapterAnalyzerIncremental.ts - Single chapter analysis for incremental processing
 *
 * Extracted from chapterAnalyzer.ts to enable per-chapter analysis with external context.
 */

import { callGeminiWithThinkingAndSchemaAndParsed } from "../callFastGemini";
import { callGrokWithSchema } from "../callGrok";
import type { DetectedChapter } from "./chapterDetector";
import {
  ChapterAnalysisSchema,
  type ChapterAnalysis,
  type ChapterCharacter,
  type BookCharacter,
} from "./ocrSchema";

/** Check if error is a Gemini content block */
function isProhibitedContentError(error: unknown): boolean {
  // Check error message
  if (error instanceof Error) {
    const msg = error.message || "";
    if (msg.includes("PROHIBITED_CONTENT") || msg.includes("blockReason")) {
      return true;
    }
  }

  // Check responseBody property (AI SDK errors include this)
  const errorObj = error as { responseBody?: string };
  if (errorObj.responseBody) {
    return (
      errorObj.responseBody.includes("PROHIBITED_CONTENT") ||
      errorObj.responseBody.includes("blockReason")
    );
  }

  // Check cause chain for nested errors
  const errorWithCause = error as { cause?: unknown };
  if (errorWithCause.cause) {
    return isProhibitedContentError(errorWithCause.cause);
  }

  return false;
}

/**
 * Retry helper with provider fallback
 * - First tries Gemini (fast, cheap)
 * - Falls back to Claude if Gemini blocks content
 */
async function withRetryAndFallback<T>(
  geminiCall: () => Promise<T>,
  claudeCall: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  // Try Gemini first
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await geminiCall();
    } catch (error) {
      console.error(`[ChapterAnalyzerIncremental] Gemini attempt ${attempt + 1} failed:`, error);

      // If content is blocked, immediately fall back to Grok
      if (isProhibitedContentError(error)) {
        console.log(
          "[ChapterAnalyzerIncremental] Content blocked by Gemini, falling back to Grok...",
        );
        break;
      }

      if (attempt === maxAttempts - 1) break;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  // Fallback to Grok
  console.log("[ChapterAnalyzerIncremental] Using Grok as fallback...");
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await claudeCall();
    } catch (error) {
      console.error(`[ChapterAnalyzerIncremental] Claude attempt ${attempt + 1} failed:`, error);
      if (attempt === maxAttempts - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  throw new Error("All retry attempts failed (Gemini + Claude)");
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
   - **chapterAction**: 1-2 sentences describing what this character DOES or EXPERIENCES in THIS SPECIFIC CHAPTER (their actions, events, significance in this chapter only). 
   - make it concise. For example dont say 'He ignores his mother's pleas to quit' just say 'Ignores his mother's pleas to quit'. 

IMPORTANT: Reply in the language of the book text. If the book is in Polish, reply in Polish. If English, reply in English.

Return JSON matching the schema.`;
}

/**
 * Analyze a single chapter using AI - for incremental processing
 */
export async function analyzeChapterIncremental(
  chapter: DetectedChapter,
  previousSummaries: string,
  previousCharacters: ChapterCharacter[],
): Promise<ChapterAnalysis> {
  const prompt = buildChapterAnalysisPrompt(chapter, previousSummaries, previousCharacters);

  const result = await withRetryAndFallback(
    // Primary: Gemini (fast, cheap)
    async () => {
      return await callGeminiWithThinkingAndSchemaAndParsed(
        prompt,
        ChapterAnalysisSchema,
        "gemini-3-flash-preview",
      );
    },
    // Fallback: Grok (less aggressive content filters)
    async () => {
      return await callGrokWithSchema(prompt, ChapterAnalysisSchema);
    },
  );

  // Ensure chapterNumber matches
  return { ...result, chapterNumber: chapter.chapterNumber };
}

/**
 * Build the final character index from all chapter results
 */
export function buildCharacterIndex(chapterResults: ChapterAnalysis[]): BookCharacter[] {
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
