import { useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, Variants } from "motion/react";

import { useCharacterNotes } from "@/hooks/useCharacterNotes";
import useSplashHidden from "@/hooks/useSplashHidden";
import { useLocationRange } from "@/hooks/useLocationRange";
import CharacterCard from "./CharacterCard";
import { useLocation } from "@/state/LocationContext";
import { getBookData } from "@/genericBookDataGetters/getBookData";
import { getCharactersData } from "@/genericBookDataGetters/getCharactersData";

const target = document.getElementById("left-notes");

// Cache book data and character data outside component
const bookData = getBookData();
const isPlayFormat = bookData.metadata.bookForm === "play";
const allCharacters = getCharactersData();

const CharacterNotesPanel = () => {
  const { locationRange } = useLocationRange();
  const isSplashHidden = useSplashHidden();
  const characterNotes = useCharacterNotes(locationRange, true, true);
  const { location } = useLocation();

  const currentSpeakers = useMemo(() => {
    if (!location.currentChapter || !location.currentParagraph) {
      return [];
    }

    const currentChapter = location.currentChapter;
    const currentParagraph = location.currentParagraph;

    // Use cached character data and filter only once
    const characterChapterData = allCharacters.map((char) => {
      const chapterInfo = char.infoPerChapter.find((ch) => ch.chapter === currentChapter);
      return { slug: char.slug, paragraphsWhereTalking: chapterInfo?.paragraphsWhereTalking || [] };
    });

    if (!isPlayFormat) {
      // For book format, the speakers are ONLY those talking in the current paragraph.
      const whoIsTalkingNow = characterChapterData.filter((char) => char.paragraphsWhereTalking.includes(currentParagraph));
      return whoIsTalkingNow.map((char) => char.slug);
    }

    // For play format, apply sticky logic.
    const whoStartsTalkingNow = characterChapterData.filter((char) => char.paragraphsWhereTalking.includes(currentParagraph));

    if (whoStartsTalkingNow.length > 0) {
      return whoStartsTalkingNow.map((char) => char.slug);
    }

    let mostRecentSpeakers: string[] = [];
    let mostRecentParagraph = -1;

    characterChapterData.forEach((char) => {
      const mostRecentForThisChar = char.paragraphsWhereTalking.filter((p) => p <= currentParagraph).reduce((max, p) => Math.max(max, p), -1);

      if (mostRecentForThisChar !== -1) {
        if (mostRecentForThisChar > mostRecentParagraph) {
          mostRecentParagraph = mostRecentForThisChar;
          mostRecentSpeakers = [char.slug];
        } else if (mostRecentForThisChar === mostRecentParagraph) {
          mostRecentSpeakers.push(char.slug);
        }
      }
    });
    return mostRecentSpeakers;
  }, [location.currentChapter, location.currentParagraph]);

  if (!target || !isSplashHidden) return null;

  return createPortal(
    <AnimatePresence mode="sync">
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
                layout="preserve-aspect"
                variants={variants.character}
                initial="hidden"
                animate="visible"
                custom={index}
                exit={{ opacity: 0, x: -100, transition: { duration: 0.2 } }}
                transition={{ layout: { delay: 0.2 } }}
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
