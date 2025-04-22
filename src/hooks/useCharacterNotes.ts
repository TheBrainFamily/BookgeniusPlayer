import { paragraphMetadataServicePure, getParagraphRange, parseParagraphRange, ParsedParagraphRange } from "@/src/fetchers/getParagraphRange";
import { BOOK_SLUGS } from "@/src/consts";
import { useEffect, useState } from "react";
import { Location } from "@/src/state/LocationContext";

/**
 * Fetch + parse character metadata for the given location
 * (range = chapter‑start .. current paragraph).
 */
export function useCharacterNotes(loc: Location): ParsedParagraphRange[] {
  const [notes, setNotes] = useState<ParsedParagraphRange[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { chapter, paragraph } = loc;

      const raw =
        import.meta.env.VITE_DEVELOPMENT === "true"
          ? paragraphMetadataServicePure.getCharactersMetadataForParagraphRange({
              bookSlug: BOOK_SLUGS.PHARAON,
              startChapter: chapter,
              startParagraph: 1,
              endChapter: chapter,
              endParagraph: paragraph,
            })
          : await getParagraphRange({ bookSlug: BOOK_SLUGS.PHARAON, startChapter: chapter, startParagraph: 1, endChapter: chapter, endParagraph: paragraph });

      if (!cancelled) setNotes(parseParagraphRange(raw));
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [loc.chapter, loc.paragraph]);

  return notes;
}
