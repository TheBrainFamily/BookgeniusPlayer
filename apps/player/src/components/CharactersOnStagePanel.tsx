import { CSSProperties, useMemo, useState, useEffect, memo } from "react";
import { motion, Variants } from "motion/react";
import { ScrollArea } from "@player/components/ui/scroll-area";

import { useCharactersOnStage } from "@player/hooks/useCharactersOnStage";
import { useCurrentSpeakers } from "@player/hooks/useCurrentSpeakers";
import { useLocation } from "@player/state/LocationContext";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import CharacterCard from "./CharacterCard";
import { cn } from "@player/lib/utils";
import { useOptionalElementVisibility } from "@player/stores/elementVisibility.store";
import { Appearance } from "@player/fetchers/getParagraphRange";

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

  const characterEntities = charactersOnStage.map((character) => ({
    slug: character.slug,
    characterName: character.characterName,
    summary: "",
    imageUrl: "",
    chapterNumber: location?.currentChapter || 0,
    paragraphNumber: location?.currentParagraph || 0,
    isTalkingInFirstParagraph: currentSpeakers.includes(character.slug),
    otherAppearances: [],
  }));

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
          {characterEntities.map((characterEntity, index) => (
            <CharacterAvatar key={characterEntity.slug} characterEntity={characterEntity} currentSpeakers={currentSpeakers} index={index} />
          ))}
        </motion.div>
      </ScrollArea>
    </div>
  );
};

interface CharacterAvatarProps {
  characterEntity: {
    slug: string;
    characterName: string;
    summary: string;
    imageUrl: string;
    chapterNumber: number;
    paragraphNumber: number;
    isTalkingInFirstParagraph: boolean;
    otherAppearances: Appearance[];
  };
  currentSpeakers: string[];
  index: number;
}

const CharacterAvatar = memo<CharacterAvatarProps>(({ characterEntity, currentSpeakers, index }) => {
  const isSpeaking = currentSpeakers.includes(characterEntity.slug);

  const borderStyle = useMemo(
    () => ({
      borderColor: isSpeaking ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.2)",
      boxShadow: isSpeaking ? "0 0 10px rgba(255, 255, 255, 0.3), 0 5px 10px -5px rgba(255, 255, 255, 0.4)" : "0 5px 10px -5px rgba(255, 255, 255, 0.1)",
    }),
    [isSpeaking],
  );

  return (
    <motion.div
      id={`onstage-${characterEntity.slug}`}
      layout="position"
      variants={variants.character}
      initial="hidden"
      animate="visible"
      exit="exit"
      custom={index}
      className="flex-shrink-0 snap-start first-of-type:pl-3 last-of-type:pr-3"
      role="listitem"
      layoutId={`character-${characterEntity.slug}`}
    >
      <motion.div
        className={cn("w-[var(--avatar-size)] h-[var(--avatar-size)] rounded-full border-2 transition-colors duration-300", isSpeaking ? "speaking" : "not-speaking")}
        animate={borderStyle}
        transition={{ duration: 0.3, ease: "easeOut", borderColor: { duration: 0.2 }, boxShadow: { duration: 0.4 } }}
        whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
      >
        <CharacterCard entity={characterEntity} currentSpeakers={currentSpeakers} disableHighlight imageOnly captionMode="hover" />
      </motion.div>
    </motion.div>
  );
});

const variants: { container: Variants; character: Variants } = {
  container: { visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } },
  character: {
    hidden: { opacity: 0, scale: 0.8, y: 20 },
    visible: (i: number) => ({ opacity: 1, scale: 1, y: 0, transition: { delay: i * 0.04, duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } }),
    exit: { opacity: 0, scale: 0.7, y: -10, transition: { duration: 0.2, ease: "easeIn" } },
  },
};

export default CharactersOnStagePanel;
