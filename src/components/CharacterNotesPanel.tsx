import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useDebounce } from "@/src/hooks/useDebounce";
import { useCharacterNotes } from "@/src/hooks/useCharacterNotes";
import { CharacterCard } from "./CharacterCard";

import { useLocation } from "@/src/state/LocationContext";
import { activateCharacters } from "@/src/ui/characterHelpers";
import { getCurrentBookSlug } from "@/src/getCurrentBookSlug";

/* mount inside the legacy container for CSS */
const target = document.getElementById("left-notes");

export const CharacterNotesPanel: React.FC = () => {
  const { location } = useLocation();

  /* throttle updates while scrolling */
  const debounced = useDebounce(location, 200);

  /* stable range object */
  const range = useMemo(
    () => ({ chapter: debounced.chapter, paragraph: debounced.paragraph, endChapter: debounced.endChapter, endParagraph: debounced.endParagraph }),
    [debounced.chapter, debounced.paragraph, debounced.endChapter, debounced.endParagraph],
  );

  /* characters for that range */
  const notes = useCharacterNotes(range);

  /* Fade‑in only when the ARRAY REFERENCE actually changes */
  const [fadeInKey, setFadeInKey] = useState(0);
  useEffect(() => {
    setFadeInKey((k) => k + 1); // triggers fadeUp on the *new* cards only
  }, [notes]);

  /* mark talking / present characters */
  useEffect(() => {
    if (notes.length === 0) return;
    activateCharacters(range.chapter, range.paragraph, getCurrentBookSlug(), range.endChapter, range.endParagraph, false);
  }, [range.chapter, range.paragraph, range.endChapter, range.endParagraph, notes]);

  if (!target) return null;

  return createPortal(
    <div className="entity-notes-container fade-in">
      {notes.map((n, i) => (
        <CharacterCard
          key={`${n.canonicalName}-${fadeInKey}`} // replay anim only when list truly changes
          entity={n}
          index={i}
        />
      ))}
    </div>,
    target,
  );
};
