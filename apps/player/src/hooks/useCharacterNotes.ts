import { useEffect, useState } from "react";

import { paragraphMetadataServicePure, parseParagraphRange, ParsedParagraphRange } from "@player/fetchers/getParagraphRange";
import { bookDataLoader } from "@player/services/bookDataLoader";
import { Location } from "@player/state/LocationContext";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";

/** Very light equality check: same length and same canonicalName order */
function sameList(a: ParsedParagraphRange[], b: ParsedParagraphRange[]) {
  return a.length === b.length && a.every((v, i) => v.slug === b[i].slug);
}

/**
 * @param loc                 current paragraph-range location
 * @param addNewAtEnd         if true, keeps existing order and appends new chars;
 *                            if false, just replaces list on any change
 * @param sortAlphabetically  when appending, whether to sort the new items (and initial load) alphabetically
 */
export function useCharacterNotes(loc: Location, addNewAtEnd = false, sortAlphabetically = true): ParsedParagraphRange[] {
  const [notes, setNotes] = useState<ParsedParagraphRange[]>([]);
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { chapter, paragraph, endChapter, endParagraph } = loc;

      const raw = paragraphMetadataServicePure.getCharactersMetadataForParagraphRange(
        { bookSlug: bookDataLoader.getCurrentBook(), startChapter: chapter, startParagraph: paragraph, endChapter, endParagraph },
        getCharactersData(),
      );

      if (cancelled) return;

      const parsed = parseParagraphRange(raw);

      setNotes((prev) => {
        if (sameList(prev, parsed)) {
          return prev;
        }

        if (!addNewAtEnd) {
          return parsed;
        }

        if (prev.length === 0) {
          return sortAlphabetically ? [...parsed].sort((a, b) => a.slug.localeCompare(b.slug)) : parsed;
        }

        const existingNames = new Set(prev.map((ch) => ch.slug));
        const remaining = prev.filter((ch) => parsed.some((p) => p.slug === ch.slug));
        const newChars = parsed.filter((ch) => !existingNames.has(ch.slug));

        const updatedRemaining = remaining.map((oldCh) => parsed.find((p) => p.slug === oldCh.slug) || oldCh);

        const appended = sortAlphabetically ? [...newChars].sort((a, b) => a.slug.localeCompare(b.slug)) : newChars;

        return [...updatedRemaining, ...appended];
      });
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [loc.chapter, loc.paragraph, loc.endChapter, loc.endParagraph, addNewAtEnd, sortAlphabetically]);

  return notes;
}
