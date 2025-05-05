import { paragraphMetadataServicePure, getParagraphRange, parseParagraphRange, ParsedParagraphRange, SelfSufficientCharacterMetadata } from "@/src/fetchers/getParagraphRange";
import { BOOK_SLUGS } from "@/src/consts";
import { useEffect, useState } from "react";
import { Location } from "@/src/state/LocationContext";

/* very light equality check : length + canonicalName order */
function sameList(a: ParsedParagraphRange[], b: ParsedParagraphRange[]) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v.canonicalName === b[i].canonicalName);
}

export function useCharacterNotes(loc: Location, charactersData: SelfSufficientCharacterMetadata[]): ParsedParagraphRange[] {
  const [notes, setNotes] = useState<ParsedParagraphRange[]>([]);
  console.log("GOZDECKI MAy 3notes", notes);
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
      console.log("parsed", parsed);

      /* only update when list really changed */
      setNotes((prev) => (sameList(prev, parsed) ? prev : parsed));
    };

    load();
    console.log("GOZDECKI LOADED");
    return () => {
      cancelled = true;
    };
  }, [loc.chapter, loc.paragraph, loc.endChapter, loc.endParagraph, charactersData]);

  return notes;
}
