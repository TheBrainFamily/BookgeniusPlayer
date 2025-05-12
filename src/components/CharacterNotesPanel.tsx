import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";

import { useDebounce } from "@/hooks/useDebounce";
import { useCharacterNotes } from "@/hooks/useCharacterNotes";
import { useLocation } from "@/state/LocationContext";
import CharacterCard from "./CharacterCard";
import { BookData } from "@/booksData/types";
import useSplashHidden from "@/hooks/useSplashHidden";

/* mount inside the legacy container for CSS */
const target = document.getElementById("left-notes");

interface CharacterNotesPanelProps {
  bookData: BookData;
}

export const CharacterNotesPanel = ({ bookData }: CharacterNotesPanelProps) => {
  const { location } = useLocation();
  const debouncedLocation = useDebounce(location, 150);
  const isSplashHidden = useSplashHidden();

  /* stable range object */
  const range = useMemo(
    () => ({ chapter: debouncedLocation.chapter, paragraph: debouncedLocation.paragraph, endChapter: debouncedLocation.endChapter, endParagraph: debouncedLocation.endParagraph }),
    [debouncedLocation.chapter, debouncedLocation.paragraph, debouncedLocation.endChapter, debouncedLocation.endParagraph],
  );

  const characterNotes = useCharacterNotes(range, bookData.charactersData, true, true);

  if (!target || !isSplashHidden) return null;

  return createPortal(
    <motion.div className="entity-notes-container flex flex-col justify-center gap-2 " initial="hidden" animate="visible" variants={variants.container}>
      <AnimatePresence>
        {characterNotes.map((characterNote) => (
          <motion.div
            key={characterNote.canonicalName}
            layout="preserve-aspect"
            variants={variants.character}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, x: -100, transition: { duration: 0.2 } }}
            transition={{ layout: { delay: 0.2 } }}
          >
            <CharacterCard entity={characterNote} />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>,
    target,
  );
};

const variants = {
  container: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.5, delay: 0.2 } } },
  character: { hidden: { opacity: 0, x: -100 }, visible: (i: number) => ({ opacity: 1, x: 0, transition: { duration: 0.5, delay: 0.4 + 0.15 * i } }) },
};
