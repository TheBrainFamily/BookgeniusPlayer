import * as cheerio from "cheerio";
import { z } from "zod";
import "dotenv/config";
import { getParagraphsFromChapter } from "../createParagraphsWithPageNumbers";
import { getBookSettings } from "../../helpers/getBookSettings";
import { readBookFile } from "../../helpers/readBookFile";
import { writeBookFile } from "../../helpers/writeBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { generateTagName } from "../../helpers/generateTagName";
import { getCurrentBook } from "../../helpers/getCurrentBook";
import { type NewReferenceCardsResponse } from "../../types";
import { convex } from "../../server/convex-client";
import { buildParagraphsForSummary } from "./summaryParagraphs";
import { runChapterSummaryQueuedSchemaCall } from "./chapter-summary-llm-queue";

const CharacterActionSchema = z.object({ slug: z.string(), chapterAction: z.string() });

const ScenesSummariesPerChapterSchema = z.object({
  chapterSummary: z.object({
    contextSummary: z.string(),
    chapterBulletPoints: z.array(
      z.object({
        paragraphsSummary: z.string(),
        paragraphNumbers: z.array(z.number()),
        mainParagraphNumber: z.number(),
      }),
    ),
    characterActions: z.array(CharacterActionSchema).optional(),
  }),
});

type ScenesSummariesPerChapterBase = z.infer<typeof ScenesSummariesPerChapterSchema>;

type ChapterCharacterSummary = {
  name: string;
  slug: string;
  referenceCard: string;
  chapterAction: string;
  mentioned: boolean;
  speaking: boolean;
};

type DetectedCharacter = Omit<ChapterCharacterSummary, "chapterAction">;

type ReferenceCardBySlug = Map<string, { name: string; referenceCard: string }>;

export type ScenesSummariesPerChapter = ScenesSummariesPerChapterBase & {
  chapterSummary: ScenesSummariesPerChapterBase["chapterSummary"] & { chapterNumber: number };
  chapterCharacters: ChapterCharacterSummary[];
};

export interface GenerateSingleChapterSummaryOptions {
  chapterNum: number;
  paragraphs: { text: string; dataIndex: number }[];
  rollingSummary: string;
  bookLanguage?: string;
}

function normalizeSlug(value: string): string {
  return generateTagName(value.trim());
}

function splitSlugTokens(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function readReferenceCards(): NewReferenceCardsResponse {
  return JSON.parse(
    readBookFile("single-summary-per-person.json", FILE_TYPE.PERMANENT),
  ) as NewReferenceCardsResponse;
}

function buildReferenceCardsBySlug(referenceCards: NewReferenceCardsResponse): ReferenceCardBySlug {
  const map: ReferenceCardBySlug = new Map();

  for (const character of referenceCards.characters) {
    const slug = normalizeSlug(character.name);
    if (!map.has(slug)) {
      map.set(slug, { name: character.name, referenceCard: character.referenceCard });
    }
  }

  return map;
}

function readRewrittenChapterXml(chapterNum: number): string {
  const fileName = `rewritten-paragraphs-for-chapter-${chapterNum}.xml`;
  try {
    return readBookFile(fileName, FILE_TYPE.TEMPORARY);
  } catch {
    throw new Error(`Missing rewritten chapter XML: ${fileName}`);
  }
}

function extractDetectedCharactersFromRewrittenXml(
  xml: string,
  referenceCardsBySlug: ReferenceCardBySlug,
): DetectedCharacter[] {
  const $ = cheerio.load(xml);
  const mentionedSlugs = new Set<string>();
  const speakingSlugs = new Set<string>();
  const mentionNameBySlug = new Map<string, string>();

  $("[data-c]").each((_index, element) => {
    const rawSlug = $(element).attr("data-c");
    if (!rawSlug) {
      return;
    }

    const mentionText = $(element).text().trim();
    for (const token of splitSlugTokens(rawSlug)) {
      const slug = normalizeSlug(token);
      if (!slug) {
        continue;
      }
      mentionedSlugs.add(slug);
      if (!mentionNameBySlug.has(slug) && mentionText.length > 0) {
        mentionNameBySlug.set(slug, mentionText);
      }
    }
  });

  $("[data-speaker]").each((_index, element) => {
    const speakerRaw = $(element).attr("data-speaker");
    if (!speakerRaw) {
      return;
    }
    for (const token of splitSlugTokens(speakerRaw)) {
      const slug = normalizeSlug(token);
      if (slug) {
        speakingSlugs.add(slug);
      }
    }
  });

  const allSlugs = Array.from(new Set([...mentionedSlugs, ...speakingSlugs])).sort((a, b) =>
    a.localeCompare(b),
  );

  return allSlugs.map((slug) => {
    const reference = referenceCardsBySlug.get(slug);
    return {
      slug,
      name: reference?.name || mentionNameBySlug.get(slug) || slug,
      referenceCard: reference?.referenceCard || "",
      mentioned: mentionedSlugs.has(slug),
      speaking: speakingSlugs.has(slug),
    };
  });
}

function buildFirstAppearanceMap(
  chapterToDetectedCharacters: Map<number, DetectedCharacter[]>,
): Map<string, number> {
  const firstAppearanceBySlug = new Map<string, number>();

  const sortedEntries = [...chapterToDetectedCharacters.entries()].sort((a, b) => a[0] - b[0]);
  for (const [chapterNumber, detectedCharacters] of sortedEntries) {
    for (const character of detectedCharacters) {
      if (!firstAppearanceBySlug.has(character.slug)) {
        firstAppearanceBySlug.set(character.slug, chapterNumber);
      }
    }
  }

  return firstAppearanceBySlug;
}

function serializeDetectedCharactersForPrompt(characters: DetectedCharacter[]): string {
  if (characters.length === 0) {
    return "  <none />";
  }

  return characters
    .map(
      (character) =>
        `  <character slug="${escapeXmlAttribute(character.slug)}" name="${escapeXmlAttribute(character.name)}" mentioned="${character.mentioned ? "true" : "false"}" speaking="${character.speaking ? "true" : "false"}" referenceCard="${escapeXmlAttribute(character.referenceCard)}" />`,
    )
    .join("\n");
}

function mergeDetectedCharactersWithActions(
  detectedCharacters: DetectedCharacter[],
  characterActions: Array<{ slug: string; chapterAction: string }> | undefined,
  referenceCardsBySlug: ReferenceCardBySlug,
): ChapterCharacterSummary[] {
  const actionBySlug = new Map<string, string>();
  for (const action of characterActions || []) {
    const normalizedSlug = normalizeSlug(action.slug);
    if (!normalizedSlug || actionBySlug.has(normalizedSlug)) {
      continue;
    }
    actionBySlug.set(normalizedSlug, action.chapterAction);
  }

  const merged: ChapterCharacterSummary[] = detectedCharacters.map((character) => ({
    ...character,
    chapterAction: actionBySlug.get(character.slug) || "",
  }));

  const seenSlugs = new Set(merged.map((character) => character.slug));
  for (const [slug, chapterAction] of actionBySlug.entries()) {
    if (seenSlugs.has(slug)) {
      continue;
    }

    const reference = referenceCardsBySlug.get(slug);
    merged.push({
      slug,
      name: reference?.name || slug,
      referenceCard: reference?.referenceCard || "",
      chapterAction,
      mentioned: true,
      speaking: false,
    });
  }

  return merged.sort((a, b) => a.slug.localeCompare(b.slug));
}

function resolveConvexBookPath(): string {
  const selected = getCurrentBook().replace(/\\/g, "/").replace(/\/+$/, "");
  if (selected.startsWith("books/")) {
    return selected;
  }

  const slug = selected.split("/").filter(Boolean).pop();
  if (!slug) {
    throw new Error("Could not derive book slug from current book selection");
  }

  return `books/${slug}`;
}

export const turnChapterSummariesIntoBulletPointsMappedToParagraphs = async () => {
  const bookSettings = getBookSettings();
  const chapterFrom = bookSettings.startFromChapter;
  const chapterTo = bookSettings.startFromChapter + bookSettings.numberOfChaptersToProcess - 1;
  const chaptersToParse = Array.from(
    { length: chapterTo - chapterFrom + 1 },
    (_, i) => i + chapterFrom,
  );

  const referenceCards = readReferenceCards();
  const referenceCardsBySlug = buildReferenceCardsBySlug(referenceCards);
  const bookPath = resolveConvexBookPath();

  const detectedByChapter = new Map<number, DetectedCharacter[]>();
  for (const chapterNum of chaptersToParse) {
    const rewrittenXml = readRewrittenChapterXml(chapterNum);
    const detectedCharacters = extractDetectedCharactersFromRewrittenXml(
      rewrittenXml,
      referenceCardsBySlug,
    );
    detectedByChapter.set(chapterNum, detectedCharacters);
  }

  const firstAppearanceBySlug = buildFirstAppearanceMap(detectedByChapter);

  const jsonSummaries: ScenesSummariesPerChapter[] = [];

  await Promise.all(
    chaptersToParse.map(async (chapterNum) => {
      const detectedCharacters = detectedByChapter.get(chapterNum) || [];
      const detectedCharactersXml = serializeDetectedCharactersForPrompt(detectedCharacters);

      const paragraphsFromChapter = getParagraphsFromChapter(chapterNum, true, true);
      const paragraphsForPage = buildParagraphsForSummary(paragraphsFromChapter);

      const prompt = `
## Fiction Chapter Event Extraction & Indexing

### Goal

You are building a searchable index for a fiction book: ${bookSettings.title} by ${bookSettings.author}. Your task is to break down the provided chapter into a chronological list of distinct "Plot Events" (or "Beats"). These events will be used to answer user questions about specific details, so high granularity is essential.

### Critical Instructions

1.  **Granularity over Brevity:** Do not compress a long conversation into "They talked about their past." Break it down: "Character A asked about X," "Character B lied about Y," "Character A got angry."
2.  **Self-Contained Points:** Each bullet point acts as a standalone database entry. It must be understandable without reading the points before or after it.
    - _Bad:_ "He refused it." (Who? Refused what?)
    - _Good:_ "Stanisław Wokulski refused the invitation to the Baron's ball."
3.  **No Pronouns:** Never start a sentence with "He," "She," or "They." Always use the character's full name (e.g., "Ignacy Rzecki" instead of "Rzecki" or "he").
4.  **Paragraph Mapping:**
    - \`paragraphNumbers\`: An array of all paragraphs that cover this specific event.
    - \`mainParagraphNumber\`: The single most relevant paragraph (the "anchor") for this event. This is where a user would land if they clicked this search result.
5. No spoilers - do not mention information that is not yet revealed in the chapter. If character A tells character B a lie, but we don't know its a lie yet, just mention that character A told character B something, but don't mention that it's a lie. Stick to the facts as they are revealed in the chapter.
6. Add optional \`characterActions\` in the output. For each detected character slug, add concise chapter action summary under \`characterActions\` as \`{ slug, chapterAction }\`. If needed, you may include additional character slugs that appear relevant.

### Output Format

Return a VALID JSON object matching this schema:

\`\`\`json
{
  "chapterSummary": {
    "contextSummary": "A 3-4 sentence high-level overview of the chapter's main themes and outcome.",
    "chapterBulletPoints": [
      {
        "paragraphsSummary": "Description of the specific event using full names.",
        "paragraphNumbers": [10, 11],
        "mainParagraphNumber": 11
      }
    ],
    "characterActions": [
      {
        "slug": "character-slug",
        "chapterAction": "What this character does or experiences in this chapter."
      }
    ]
  }
}
\`\`\`

### Input Data

**Detected Characters (for reference):**
<characters>
${detectedCharactersXml}
</characters>

## Chapter ${chapterNum}
<chapterText>
${paragraphsForPage}
</chapterText>
      `;

      console.log("requesting summary for chapter", chapterNum);
      let summary: ScenesSummariesPerChapterBase;
      try {
        const { provider, result } = await runChapterSummaryQueuedSchemaCall({
          prompt: `${prompt}\n Reply in the language of the book. It's usually Polish or English. Your instructions are in English so you often reply in English, buts its VERY important to reply in Polish when the book is in Polish, and same goes for other languages.`,
          schema: ScenesSummariesPerChapterSchema,
          model: "gemini-3-flash-preview",
        });
        console.log(`chapter ${chapterNum} summary provider: ${provider}`);
        summary = result as ScenesSummariesPerChapterBase;
      } catch (error) {
        console.error(`Error for chapter ${chapterNum} (gemini/vertex queue)`, error);
        throw new Error(`Failed to generate chapter summary for chapter ${chapterNum}`);
      }

      console.log(`\n\nChapter ${chapterNum} summary: done`);

      const chapterCharacters = mergeDetectedCharactersWithActions(
        detectedCharacters,
        summary.chapterSummary.characterActions,
        referenceCardsBySlug,
      );

      await Promise.all(
        chapterCharacters.map(async (character) => {
          const firstAppearanceChapter = firstAppearanceBySlug.get(character.slug) ?? chapterNum;
          await convex.upsertCharacterChapterSummary({
            bookPath,
            characterSlug: character.slug,
            chapterNumber: chapterNum,
            summary: character.chapterAction || character.referenceCard,
            isFirstAppearance: firstAppearanceChapter === chapterNum,
          });
        }),
      );

      const enrichedSummary: ScenesSummariesPerChapter = {
        chapterSummary: { ...summary.chapterSummary, chapterNumber: chapterNum },
        chapterCharacters,
      };

      jsonSummaries.push(enrichedSummary);
      writeBookFile(`prompt-summaries-with-paragraphs-${chapterNum}.txt`, prompt);
      writeBookFile(
        `summaries-with-paragraphs-${chapterNum}.json`,
        JSON.stringify(enrichedSummary, null, 2),
      );
    }),
  );

  writeBookFile(
    "summaries-with-paragraphs.json",
    JSON.stringify(
      jsonSummaries.sort((a, b) => a.chapterSummary.chapterNumber - b.chapterSummary.chapterNumber),
      null,
      2,
    ),
  );
};

if (require.main === module) {
  turnChapterSummariesIntoBulletPointsMappedToParagraphs();
}
