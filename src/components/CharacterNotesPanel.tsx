import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";

import { useDebounce } from "@/src/hooks/useDebounce";
import { useCharacterNotes } from "@/src/hooks/useCharacterNotes";
import { useLocation } from "@/src/state/LocationContext";
import { CharacterCard } from "./CharacterCard";
import { BookData } from "@/src/booksData/types";

/* mount inside the legacy container for CSS */
const target = document.getElementById("left-notes");

interface CharacterNotesPanelProps {
  bookData: BookData;
}

export const CharacterNotesPanel = ({ bookData }: CharacterNotesPanelProps) => {
  const { location } = useLocation();

  /* throttle updates while scrolling */
  const debounced = useDebounce(location, 100);

  /* stable range object */
  const range = useMemo(
    () => ({ chapter: debounced.chapter, paragraph: debounced.paragraph, endChapter: debounced.endChapter, endParagraph: debounced.endParagraph }),
    [debounced.chapter, debounced.paragraph, debounced.endChapter, debounced.endParagraph],
  );

  /* characters for that range */
  const notes = useCharacterNotes(range, bookData.charactersData);

  if (!target) return null;

  return createPortal(
    <motion.div layout className="entity-notes-container">
      <AnimatePresence>
        {notes
          .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName))
          .map((n, i) => (
            <motion.div
              key={n.canonicalName}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20, transition: { duration: 0.2, ease: "easeInOut" } }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <CharacterCard entity={n} index={i} />
            </motion.div>
          ))}
      </AnimatePresence>
    </motion.div>,
    target,
  );
};
