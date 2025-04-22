import { paragraphMetadataServicePure, getParagraphRange, parseParagraphRange, ParsedParagraphRange } from "@/src/fetchers/getParagraphRange";
import { BOOK_SLUGS } from "@/src/consts";
import { useEffect, useState } from "react";
import { Location } from "@/src/state/LocationContext";

/* very light equality check : length + canonicalName order */
function sameList(a: ParsedParagraphRange[], b: ParsedParagraphRange[]) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v.canonicalName === b[i].canonicalName);
}

export function useCharacterNotes(loc: Location): ParsedParagraphRange[] {
  const [notes, setNotes] = useState<ParsedParagraphRange[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { chapter, paragraph, endChapter, endParagraph } = loc;

      const raw =
        import.meta.env.VITE_DEVELOPMENT === "true"
          ? paragraphMetadataServicePure.getCharactersMetadataForParagraphRange({
              bookSlug: BOOK_SLUGS.PHARAON,
              startChapter: chapter,
              startParagraph: paragraph,
              endChapter: endChapter,
              endParagraph: endParagraph,
            })
          : await getParagraphRange({ bookSlug: BOOK_SLUGS.PHARAON, startChapter: chapter, startParagraph: paragraph, endChapter: endChapter, endParagraph: endParagraph });

      if (cancelled) return;

      const parsed = parseParagraphRange(raw);

      /* only update when list really changed */
      setNotes((prev) => (sameList(prev, parsed) ? prev : parsed));
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [loc.chapter, loc.paragraph]);

  return notes;
}
