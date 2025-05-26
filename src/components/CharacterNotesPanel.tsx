import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, Variants } from "motion/react";

import { BookData } from "@/booksData/types";
import { useCharacterNotes } from "@/hooks/useCharacterNotes";
import useSplashHidden from "@/hooks/useSplashHidden";
import { useLocationRange } from "@/hooks/useLocationRange";
import CharacterCard from "./CharacterCard";

const target = document.getElementById("left-notes");

interface CharacterNotesPanelProps {
  bookData: BookData;
}

const CharacterNotesPanel = ({ bookData }: CharacterNotesPanelProps) => {
  const { locationRange } = useLocationRange();
  const isSplashHidden = useSplashHidden();
  const characterNotes = useCharacterNotes(locationRange, bookData.charactersData, true, true);

  if (!target || !isSplashHidden) return null;

  return createPortal(
    <AnimatePresence mode="sync">
      {isSplashHidden && (
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
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  );
};

const variants: Record<string, Variants> = {
  container: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 2, delay: 2, when: "afterChildren" } } },
  character: {
    hidden: { opacity: 0, x: -100, y: 10 },
    visible: (i: number) => ({ opacity: 1, x: 0, y: 0, transition: { duration: 0.6, delay: 0.5 + 0.15 * i, type: "spring", stiffness: 100 } }),
  },
};

export default CharacterNotesPanel;
