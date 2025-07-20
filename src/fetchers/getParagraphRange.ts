/**
 * paragraph‑metadata.ts
 *
 * Stand‑alone, browser‑friendly version of the server‑side aggregation logic
 * plus helpers to fetch from an API and to post‑process the result for the UI.
 * Drop this in your src/ folder, fix the import paths if needed, and it should
 * compile without any additional tweaks.
 */

import { BOOK_SLUGS } from "@/consts";
import { getBookData } from "@/genericBookDataGetters/getBookData";

/* -------------------------------------------------------------------------- */
/*  Shared types                                                              */
/* -------------------------------------------------------------------------- */

export interface InfoPerChapter {
  chapter: number;
  summary: string;
  slug?: string;
  characterName?: string;
  paragraphsWhereSpotted: number[];
  paragraphsWhereTalking: number[];
  paragraphsWhereEnters?: number[];
  paragraphsWhereExits?: number[];
}

export interface SelfSufficientCharacterMetadata {
  slug: string;
  characterName: string;
  bookSlug: string;
  infoPerChapter: InfoPerChapter[];
  imageUrl: string;
}

export interface SimpleCharacterMetadata {
  characterName: string;
  infoPerChapter: { chapter: number; paragraphsWhereSpotted: number[]; paragraphsWhereTalking: number[] }[];
}

/* -------------------------------------------------------------------------- */
/*  1. Client‑side fetch wrapper (used when you DO have the API available)    */
/* -------------------------------------------------------------------------- */

export interface GetParagraphRangeParams {
  bookSlug: BOOK_SLUGS;
  startChapter: number;
  startParagraph: number;
  endChapter: number;
  endParagraph: number;
}

/* -------------------------------------------------------------------------- */
/*  2. Pure in‑memory implementation (works straight on a JSON dump)          */
/* -------------------------------------------------------------------------- */

type PureRange = { startChapter: number; endChapter: number; bookSlug: BOOK_SLUGS; startParagraph: number; endParagraph: number };

export const paragraphMetadataServicePure = {
  /**
   * Returns the slice of `data` that matches the given range, replicating the
   * MongoDB aggregation you run on the server.
   */
  getCharactersMetadataForParagraphRange(range: PureRange, data: SelfSufficientCharacterMetadata[]): SelfSufficientCharacterMetadata[] {
    const { startChapter, endChapter, bookSlug, startParagraph, endParagraph } = range;
    const {
      metadata: { bookForm },
    } = getBookData();

    // For "play" books, we need to know the closest entry paragraph in the current chapter
    // to correctly display characters at the very beginning (paragraph 0).
    const chapterEntryParagraphs =
      bookForm === "play"
        ? data
            .filter((d) => d.bookSlug === bookSlug)
            .flatMap((character) => character.infoPerChapter)
            .filter((c) => c.chapter === startChapter)
            .flatMap((c) => c.paragraphsWhereEnters || [])
            .filter((p) => p > 0)
        : [];

    return (
      data
        // 1. book filter ───────────────────────────────────────────────────────
        .filter((d) => d.bookSlug === bookSlug)
        // 2. chapter & paragraph filtering ────────────────────────────────────
        .map((character) => {
          const infoPerChapter: InfoPerChapter[] = character.infoPerChapter
            // keep only chapters inside the chapter range
            .filter((c) => c.chapter >= startChapter && c.chapter <= endChapter)
            // for every chapter keep only the paragraphs that satisfy the rules
            .map((c) => {
              const keep = (p: number) => {
                // single‑chapter span
                if (startChapter === endChapter) {
                  return p >= startParagraph && p <= endParagraph;
                }
                // span across ≥2 chapters
                if (c.chapter === startChapter) return p >= startParagraph;
                if (c.chapter === endChapter) return p <= endParagraph;
                // chapters strictly between start & end
                return true;
              };

              const paragraphsWhereTalking = c.paragraphsWhereTalking.filter(keep);
              const paragraphsWhereSpotted =
                bookForm === "play"
                  ? createParagraphsWhereSpottedForPlay(startParagraph, endParagraph, c.paragraphsWhereEnters, c.paragraphsWhereExits, chapterEntryParagraphs).filter(keep)
                  : c.paragraphsWhereSpotted.filter(keep);

              return { ...c, paragraphsWhereSpotted, paragraphsWhereTalking };
            })
            // drop chapters whose spotted OR talking list is now empty
            .filter((c) => c.paragraphsWhereSpotted.length > 0 || c.paragraphsWhereTalking.length > 0);

          // drop characters that vanished entirely
          if (infoPerChapter.length === 0) return null;

          return { ...character, infoPerChapter } as SelfSufficientCharacterMetadata;
        })
        .filter(Boolean) as SelfSufficientCharacterMetadata[]
    );
  },
};

/* -------------------------------------------------------------------------- */
/*  3. UI‑oriented post‑processing                                            */
/* -------------------------------------------------------------------------- */

export interface ParsedParagraphRange {
  slug: string;
  characterName: string;
  summary: string;
  imageUrl: string;
  paragraphNumber: number;
  isTalkingInFirstParagraph: boolean;
  chapterNumber: number;
  label?: string;
  otherAppearances: { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean }[];
}

/**
 * Converts the raw slice returned by the service into a flat list ordered by
 * (chapter, paragraph).  Each entry represents the character's *first*
 * appearance inside the requested range plus an array of their other
 * appearances within the same range.
 */
export function parseParagraphRange(data: SelfSufficientCharacterMetadata[]): ParsedParagraphRange[] {
  return data
    .map((character) => {
      let first: {
        chapterNumber: number;
        paragraphNumber: number;
        summary: string;
        label?: string;
        isTalking: boolean;
        others: { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean }[];
      } | null = null;

      const sortedChapters = [...character.infoPerChapter].sort((a, b) => a.chapter - b.chapter);

      for (const info of sortedChapters) {
        const sortedParagraphs = [...new Set([...info.paragraphsWhereSpotted, ...info.paragraphsWhereTalking])].sort((a, b) => a - b);

        if (sortedParagraphs.length === 0) continue;

        const [firstPara, ...rest] = sortedParagraphs;

        first = {
          chapterNumber: info.chapter,
          paragraphNumber: firstPara,
          isTalking: info.paragraphsWhereTalking.includes(firstPara),
          summary: info.summary,
          label: info.slug,
          others: [
            ...rest.map((p) => ({ chapterNumber: info.chapter, paragraphNumber: p, isTalkingInParagraph: info.paragraphsWhereTalking.includes(p) })),
            ...sortedChapters
              .filter((c) => c.chapter !== info.chapter)
              .flatMap((c) => c.paragraphsWhereSpotted.map((p) => ({ chapterNumber: c.chapter, paragraphNumber: p, isTalkingInParagraph: c.paragraphsWhereTalking.includes(p) }))),
          ],
        };

        break; // first appearance found, no need to inspect later chapters
      }

      if (!first) {
        console.warn(`Character ${character.characterName} has no paragraphs listed in the provided data.`);
        return null;
      }

      return {
        slug: character.slug,
        characterName: character.characterName,
        imageUrl: character.imageUrl,
        summary: first.summary,
        isTalkingInFirstParagraph: first.isTalking,
        paragraphNumber: first.paragraphNumber,
        chapterNumber: first.chapterNumber,
        label: first.label,
        otherAppearances: first.others,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a!.chapterNumber !== b!.chapterNumber) {
        return a!.chapterNumber - b!.chapterNumber;
      }
      return a!.paragraphNumber - b!.paragraphNumber;
    }) as ParsedParagraphRange[];
}

/* -------------------------------------------------------------------------- */
/*  4. Ad‑hoc "does it match?" sanity check                                   */
/* -------------------------------------------------------------------------- */

function createParagraphsWhereSpottedForPlay(
  startParagraph: number,
  endParagraph: number,
  paragraphsWhereEnters: number[] = [],
  paragraphsWhereExits: number[] = [],
  allChapterEntryParagraphs: number[] = [],
): number[] {
  const activeIntervals: Array<[number, number]> = [];

  let exitIndex = 0;

  for (let i = 0; i < paragraphsWhereEnters.length; i++) {
    const entry = paragraphsWhereEnters[i];

    let correspondingExit = endParagraph + 1;

    while (exitIndex < paragraphsWhereExits.length && paragraphsWhereExits[exitIndex] <= entry) {
      exitIndex++;
    }

    if (exitIndex < paragraphsWhereExits.length) {
      correspondingExit = paragraphsWhereExits[exitIndex];
      exitIndex++;
    }

    activeIntervals.push([entry, correspondingExit - 1]);
  }

  const uniqueSpottedParagraphs = new Set<number>();

  // Special case: At the start of a chapter, if this character is among the first to enter,
  // we treat them as "spotted" at paragraph 0 so they appear immediately.
  if (startParagraph === 0 && allChapterEntryParagraphs.length > 0) {
const closestEntry = allChapterEntryParagraphs.reduce((a, b) => Math.min(a, b));
    if (paragraphsWhereEnters.includes(closestEntry)) {
      uniqueSpottedParagraphs.add(0);
    }
  }

  for (const [intervalStart, intervalEnd] of activeIntervals) {
    const overlapStart = Math.max(intervalStart, startParagraph);
    const overlapEnd = Math.min(intervalEnd, endParagraph);

    if (overlapStart <= overlapEnd) {
      for (let p = overlapStart; p <= overlapEnd; p++) {
        uniqueSpottedParagraphs.add(p);
      }
    }
  }

  return Array.from(uniqueSpottedParagraphs).sort((a, b) => a - b);
}
