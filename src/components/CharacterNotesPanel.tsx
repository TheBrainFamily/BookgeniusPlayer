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
  const debouncedLocation = useDebounce(location, 150);

  /* stable range object */
  const range = useMemo(
    () => ({ chapter: debouncedLocation.chapter, paragraph: debouncedLocation.paragraph, endChapter: debouncedLocation.endChapter, endParagraph: debouncedLocation.endParagraph }),
    [debouncedLocation.chapter, debouncedLocation.paragraph, debouncedLocation.endChapter, debouncedLocation.endParagraph],
  );

  const characterNotes = useCharacterNotes(range, bookData.charactersData, true, true);

  if (!target) return null;

  return createPortal(
    <motion.div className="entity-notes-container">
      <AnimatePresence>
        {characterNotes.map((n, i) => (
          <motion.div
            key={n.canonicalName}
            layout="preserve-aspect"
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.4, delay: 0.2 * i, exit: { duration: 0.2 }, layout: { delay: 0.2 } }}
          >
            <CharacterCard entity={n} index={i} />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>,
    target,
  );
};
