/**
 * paragraph‑metadata.ts
 *
 * Stand‑alone, browser‑friendly version of the server‑side aggregation logic
 * plus helpers to fetch from an API and to post‑process the result for the UI.
 * Drop this in your src/ folder, fix the import paths if needed, and it should
 * compile without any additional tweaks.
 */

import { BOOK_SLUGS } from "@/consts";

/* -------------------------------------------------------------------------- */
/*  Shared types                                                              */
/* -------------------------------------------------------------------------- */

export interface InfoPerChapter {
  chapter: number;
  summary: string;
  label?: string;
  paragraphsWhereSpotted: number[];
  paragraphsWhereTalking: number[];
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

              const paragraphsWhereSpotted = c.paragraphsWhereSpotted.filter(keep);
              const paragraphsWhereTalking = c.paragraphsWhereTalking.filter(keep);

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
          label: info.label,
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
