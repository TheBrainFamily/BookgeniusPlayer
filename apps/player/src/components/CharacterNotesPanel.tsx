import { useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, Variants } from "motion/react";

import { useCharacterNotes } from "@player/hooks/useCharacterNotes";
import { useCurrentSpeakers } from "@player/hooks/useCurrentSpeakers";
import useSplashHidden from "@player/hooks/useSplashHidden";
import { useLocationRange } from "@player/hooks/useLocationRange";
import { useLocation } from "@player/state/LocationContext";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { useBookForm } from "@player/hooks/useBookForm";
import CharacterCard from "./CharacterCard";

const CharacterNotesPanel = () => {
  const target = document.getElementById("left-notes");
  const { locationRange } = useLocationRange();
  const isSplashHidden = useSplashHidden();
  const characterNotes = useCharacterNotes(locationRange, true, true);
  const { location } = useLocation();
  const { isPlayFormat } = useBookForm();

  const allCharacters = useMemo(() => getCharactersData(), []);
  const currentSpeakers = useCurrentSpeakers(location, allCharacters, isPlayFormat);

  if (isPlayFormat || !target) return null;

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
  container: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 3, delay: 1.5, staggerChildren: 0.05 } } },
  character: { hidden: { opacity: 0, x: -100 }, visible: (i: number) => ({ opacity: 1, x: 0, transition: { delay: i * 0.05 } }) },
};

export default CharacterNotesPanel;
