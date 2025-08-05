import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { useCharactersOnStage } from "@/hooks/useCharactersOnStage";
import { AnimatePresence, motion } from "motion/react";
import { useCurrentSpeakers } from "@/hooks/useCurrentSpeakers";
import { useLocation } from "@/state/LocationContext";
import { getCharactersData } from "@/genericBookDataGetters/getCharactersData";
import { getBookData } from "@/genericBookDataGetters/getBookData";
import { cn } from "@/lib/utils";

const target = document.getElementById("bottom-panel");

const CharactersOnStagePanel = () => {
  const charactersOnStage = useCharactersOnStage();
  const { location } = useLocation();
  const allCharacters = useMemo(() => getCharactersData(), []);
  const bookData = useMemo(() => getBookData(), []);
  const isPlayFormat = useMemo(() => bookData.metadata.bookForm === "play", [bookData]);

  const currentSpeakers = useCurrentSpeakers(location!, allCharacters, isPlayFormat);

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
