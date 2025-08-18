import { useMemo } from "react";
import { AnimatePresence, motion, Variants } from "motion/react";

import { useCharactersOnStage } from "@player/hooks/useCharactersOnStage";
import { useCurrentSpeakers } from "@player/hooks/useCurrentSpeakers";
import { useLocation } from "@player/state/LocationContext";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import CharacterCard from "./CharacterCard";
import { cn } from "@player/lib/utils";

const CharactersOnStagePanel = () => {
  const allCharacters = useMemo(() => getCharactersData(), []);

  const charactersOnStage = useCharactersOnStage(allCharacters);
  const { location } = useLocation();
  const currentSpeakers = useCurrentSpeakers(location, allCharacters, true);

  if (!location) return null;

  return (
    <div className="characters-on-stage-panel flex justify-center items-center h-full">
      <AnimatePresence mode="sync">
        <motion.div className="flex justify-center items-center gap-2" initial="hidden" animate="visible" variants={variants.container}>
          <AnimatePresence>
            {charactersOnStage.map((character, index) => {
              const isSpeaking = currentSpeakers.includes(character.slug);
              const characterEntity = {
                slug: character.slug,
                characterName: character.characterName,
                label: character.characterName,
                summary: "",
                imageUrl: "",
                chapterNumber: location.currentChapter,
                paragraphNumber: location.currentParagraph,
                isTalkingInFirstParagraph: isSpeaking,
                otherAppearances: [],
              };

              return (
                <motion.div
                  key={character.slug}
                  layout="preserve-aspect"
                  variants={variants.character}
                  initial="hidden"
                  animate="visible"
                  custom={index}
                  exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                  transition={{ layout: { delay: 0.1 } }}
                  className="flex-shrink-0"
                >
                  <motion.div
                    className={cn("w-20 h-20 rounded-full border-2", isSpeaking ? "speaking" : "not-speaking")}
                    animate={{ borderColor: "rgba(255, 255, 255, 0.2)", boxShadow: "0 5px 10px -5px rgba(255, 255, 255, 0.2)" }}
                    transition={{ duration: 0.5, ease: "easeInOut", borderColor: { duration: 0.5 }, boxShadow: { duration: 0.5 } }}
                  >
                    <CharacterCard entity={characterEntity} currentSpeakers={currentSpeakers} hideTitle disableHighlight imageOnly />
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const variants: { container: Variants; character: Variants } = {
  container: { visible: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } } },
  character: {
    hidden: { opacity: 0, scale: 0.8, y: 20 },
    visible: (i: number) => ({ opacity: 1, scale: 1, y: 0, transition: { delay: i * 0.1, duration: 0.4, ease: "easeOut" } }),
  },
};

export default CharactersOnStagePanel;
