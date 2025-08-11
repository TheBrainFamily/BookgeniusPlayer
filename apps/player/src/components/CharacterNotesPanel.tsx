import { useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, Variants } from "motion/react";

import { useCharacterNotes } from "@/hooks/useCharacterNotes";
import { useCurrentSpeakers } from "@/hooks/useCurrentSpeakers";
import useSplashHidden from "@/hooks/useSplashHidden";
import { useLocationRange } from "@/hooks/useLocationRange";
import CharacterCard from "./CharacterCard";
import { useLocation } from "@/state/LocationContext";
import { getBookData } from "@/genericBookDataGetters/getBookData";
import { getCharactersData } from "@/genericBookDataGetters/getCharactersData";

const target = document.getElementById("left-notes");

const CharacterNotesPanel = () => {
  const { locationRange } = useLocationRange();
  const isSplashHidden = useSplashHidden();
  const characterNotes = useCharacterNotes(locationRange, true, true);
  const { location } = useLocation();

  const bookData = useMemo(() => getBookData(), []);
  const isPlayFormat = useMemo(() => bookData.metadata.bookForm === "play", [bookData]);
  const allCharacters = useMemo(() => getCharactersData(), []);

  const currentSpeakers = useCurrentSpeakers(location, allCharacters, isPlayFormat);

  if (isPlayFormat || !target || !isSplashHidden) return null;

  return createPortal(
    <AnimatePresence>
      {isSplashHidden && (
        <motion.div
          className="character-notes-custom content-center h-full space-y-3 py-10 overflow-x-hidden no-scrollbar"
          initial="hidden"
          animate="visible"
          variants={variants.container}
        >
          <AnimatePresence>
            {characterNotes.map((characterNote, index) => (
              <motion.div
                key={characterNote.slug}
                layout="position"
                variants={variants.character}
                initial="hidden"
                animate="visible"
                custom={index}
                exit={{ opacity: 0, x: -100, transition: { duration: 0.2 } }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              >
                <CharacterCard entity={characterNote} currentSpeakers={currentSpeakers} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  );
};

const variants: { container: Variants; character: Variants } = {
  container: { visible: { transition: { staggerChildren: 0.05 } } },
  character: { hidden: { opacity: 0, x: -100 }, visible: (i: number) => ({ opacity: 1, x: 0, transition: { delay: i * 0.05 } }) },
};

export default CharacterNotesPanel;
