import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, Variants } from "motion/react";

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
    () => ({
      chapter: debouncedLocation.chapter,
      paragraph: debouncedLocation.paragraph,
      endChapter: debouncedLocation.endChapter,
      endParagraph: debouncedLocation.endParagraph,
      currentChapter: debouncedLocation.currentChapter,
      currentParagraph: debouncedLocation.currentParagraph,
    }),
    [
      debouncedLocation.chapter,
      debouncedLocation.paragraph,
      debouncedLocation.endChapter,
      debouncedLocation.endParagraph,
      debouncedLocation.currentChapter,
      debouncedLocation.currentParagraph,
    ],
  );

  const characterNotes = useCharacterNotes(range, bookData.charactersData, true, true);

  if (!target || !isSplashHidden) return null;

  return createPortal(
    <motion.div className="content-center h-full space-y-3 py-10 overflow-x-hidden" initial="hidden" animate="visible" variants={variants.container}>
      <AnimatePresence>
        {characterNotes.map((characterNote, index) => (
          <motion.div
            key={characterNote.slug}
            layout="preserve-aspect"
            variants={variants.character}
            initial="hidden"
            animate="visible"
            custom={index}
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

const variants: Record<string, Variants> = {
  container: {
    hidden: { opacity: 0, x: -150, scale: 0.95, rotate: -2 },
    visible: { opacity: 1, x: 0, scale: 1, rotate: 0, transition: { duration: 0.5, delay: 0.5, type: "linear" } },
  },
  character: {
    hidden: { opacity: 0, x: -100, y: 10 },
    visible: (i: number) => ({ opacity: 1, x: 0, y: 0, transition: { duration: 0.6, delay: 0.8 + 0.15 * i, type: "spring", stiffness: 100 } }),
  },
};
