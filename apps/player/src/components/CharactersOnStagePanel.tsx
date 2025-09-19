import { CSSProperties, useMemo, useState, useEffect } from "react";
import { AnimatePresence, motion, Variants } from "motion/react";
import { ScrollArea } from "@player/components/ui/scroll-area";

import { useCharactersOnStage } from "@player/hooks/useCharactersOnStage";
import { useCurrentSpeakers } from "@player/hooks/useCurrentSpeakers";
import { useLocation } from "@player/state/LocationContext";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import CharacterCard from "./CharacterCard";
import { cn } from "@player/lib/utils";
import { useOptionalElementVisibility } from "@player/stores/elementVisibility.store";

const AVATAR_SIZE = "clamp(55px, 6.5vw, 90px)";

const CharactersOnStagePanel = () => {
  const allCharacters = useMemo(() => getCharactersData(), []);
  const charactersOnStage = useCharactersOnStage(allCharacters);
  const { location } = useLocation();
  const currentSpeakers = useCurrentSpeakers(location, allCharacters, true);

  const isOverlayVisible = useOptionalElementVisibility();

  // Safe screen width detection for SSR compatibility
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);

  useEffect(() => {
    const checkScreenWidth = () => setIsNarrowScreen(window.innerWidth < 1024);
    checkScreenWidth();
    window.addEventListener("resize", checkScreenWidth);
    return () => window.removeEventListener("resize", checkScreenWidth);
  }, []);

  // Desktop (≥1024px): avatars are ALWAYS visible (never hide)
  // Narrow screens (<1024px): hide avatars when overlay is visible
  const shouldHideAvatars = isNarrowScreen && isOverlayVisible;

  if (!location) return null;

  return (
    <div
      className={cn(
        "characters-on-stage-panel flex justify-center items-center transition-opacity duration-300 max-w-full absolute bottom-2 lg:bottom-14 m-0",
        shouldHideAvatars ? "opacity-0 pointer-events-none" : "opacity-100 pointer-events-auto",
      )}
    >
      <AnimatePresence mode="sync">
        <ScrollArea
          className="relative w-full h-full"
          orientation="horizontal"
          wheelToHorizontal
          hideScrollbar
          style={{
            WebkitMaskImage: "linear-gradient(to right, transparent 0, black 24px, black calc(100% - 24px), transparent 100%)",
            maskImage: "linear-gradient(to right, transparent 0, black 24px, black calc(100% - 24px), transparent 100%)",
          }}
        >
          <motion.div
            className={cn("min-w-max flex flex-nowrap justify-center gap-2 py-2 px-3 md:px-4 select-none")}
            initial="hidden"
            animate="visible"
            variants={variants.container}
            style={{ "--avatar-size": AVATAR_SIZE } as CSSProperties}
            role="list"
          >
            {charactersOnStage.map((character, index) => {
              const isSpeaking = currentSpeakers.includes(character.slug);
              const characterEntity = {
                slug: character.slug,
                characterName: character.characterName,
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
                  id={`onstage-${character.slug}`}
                  layout="position"
                  variants={variants.character}
                  initial="hidden"
                  animate="visible"
                  custom={index}
                  exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
                  className="flex-shrink-0 snap-start first-of-type:pl-3 last-of-type:pr-3"
                  role="listitem"
                >
                  <motion.div
                    className={cn("w-[var(--avatar-size)] h-[var(--avatar-size)] rounded-full border-2", isSpeaking ? "speaking" : "not-speaking")}
                    animate={{ borderColor: "rgba(255, 255, 255, 0.2)", boxShadow: "0 5px 10px -5px rgba(255, 255, 255, 0.2)" }}
                    transition={{ duration: 0.5, ease: "easeInOut", borderColor: { duration: 0.5 }, boxShadow: { duration: 0.5 } }}
                  >
                    <CharacterCard entity={characterEntity} currentSpeakers={currentSpeakers} disableHighlight imageOnly captionMode="hover" />
                  </motion.div>
                </motion.div>
              );
            })}
          </motion.div>
        </ScrollArea>
      </AnimatePresence>
    </div>
  );
};

const variants: { container: Variants; character: Variants } = {
  container: { visible: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } } },
  character: {
    hidden: { opacity: 0, scale: 0.9, y: 12 },
    visible: (i: number) => ({ opacity: 1, scale: 1, y: 0, transition: { delay: i * 0.06, duration: 0.32, ease: "easeOut" } }),
  },
};

export default CharactersOnStagePanel;
