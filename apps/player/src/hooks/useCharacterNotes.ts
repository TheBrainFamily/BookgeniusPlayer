import { useEffect, useState } from "react";

import {
  paragraphMetadataServicePure,
  parseParagraphRange,
  ParsedParagraphRange,
} from "@player/fetchers/getParagraphRange";
import { Location } from "@player/state/LocationContext";
import { useBookConvex } from "@player/context/BookConvexContext";

/** Deep equality check using JSON - compares ALL fields */
function notesEqual(a: ParsedParagraphRange[], b: ParsedParagraphRange[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * @param loc                 current paragraph-range location
 * @param addNewAtEnd         if true, keeps existing order and appends new chars;
 *                            if false, just replaces list on any change
 * @param sortAlphabetically  when appending, whether to sort the new items (and initial load) alphabetically
 */
export function useCharacterNotes(
  loc: Location,
  addNewAtEnd = false,
  sortAlphabetically = true,
): ParsedParagraphRange[] {
  const [notes, setNotes] = useState<ParsedParagraphRange[]>([]);
  const { charactersData, bookData } = useBookConvex();
  const bookSlug = bookData?.slug ?? "";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { chapter, paragraph, endChapter, endParagraph } = loc;

      const raw = paragraphMetadataServicePure.getCharactersMetadataForParagraphRange(
        { bookSlug, startChapter: chapter, startParagraph: paragraph, endChapter, endParagraph },
        charactersData,
      );

      if (cancelled) return;

      const parsed = parseParagraphRange(raw);

      setNotes((prev) => {
        if (!addNewAtEnd) {
          // Simple mode: return prev if nothing changed, otherwise replace
          return notesEqual(prev, parsed) ? prev : parsed;
        }

        if (prev.length === 0) {
          return sortAlphabetically
            ? [...parsed].sort((a, b) => a.slug.localeCompare(b.slug))
            : parsed;
        }

        // Preserve order for existing characters, append new ones
        const existingNames = new Set(prev.map((ch) => ch.slug));
        const remaining = prev.filter((ch) => parsed.some((p) => p.slug === ch.slug));
        const newChars = parsed.filter((ch) => !existingNames.has(ch.slug));

        // Update with fresh data from parsed (contains new media URLs)
        const updatedRemaining = remaining.map(
          (oldCh) => parsed.find((p) => p.slug === oldCh.slug) || oldCh,
        );
        const appended = sortAlphabetically
          ? [...newChars].sort((a, b) => a.slug.localeCompare(b.slug))
          : newChars;
        const result = [...updatedRemaining, ...appended];

        // Return prev if nothing changed to preserve reference equality
        return notesEqual(prev, result) ? prev : result;
      });
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [
    loc.chapter,
    loc.paragraph,
    loc.endChapter,
    loc.endParagraph,
    addNewAtEnd,
    sortAlphabetically,
    bookSlug,
    charactersData,
  ]);

  return notes;
}
