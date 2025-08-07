import { createPortal } from "react-dom";
import { useCharactersOnStage } from "@/hooks/useCharactersOnStage";
import { AnimatePresence, motion } from "motion/react";
import { useCurrentSpeakers } from "@/hooks/useCurrentSpeakers";
import { useLocation } from "@/state/LocationContext";
import { cn } from "@/lib/utils";
import { CharacterData } from "@/types/book";

const CharactersOnStagePanel = ({ allCharacters }: { allCharacters: CharacterData[] }) => {
  const target = document.getElementById("bottom-panel");
  const charactersOnStage = useCharactersOnStage(allCharacters);
  const { location } = useLocation();
  const currentSpeakers = useCurrentSpeakers(location!, allCharacters, true);

  if (!target || !location) return null;

  return createPortal(
    <div className="flex justify-center items-center h-full">
      <AnimatePresence>
        {charactersOnStage.map((character) => {
          const isSpeaking = currentSpeakers.includes(character.slug);
          return (
            <motion.div
              key={character.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
              className="p-1"
            >
              <div className="relative w-16 h-16">
                <img
                  src={character.imageUrl}
                  alt={character.characterName}
                  className={cn("w-full h-full rounded-full object-cover border-2 border-white transition-all duration-300", isSpeaking && "grayscale-[90%]")}
                  title={character.characterName}
                />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    target,
  );
};

export default CharactersOnStagePanel;
