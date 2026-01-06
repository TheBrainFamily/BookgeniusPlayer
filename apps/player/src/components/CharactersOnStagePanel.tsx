import { type CSSProperties, useMemo, useState, useEffect, memo } from "react";
import { motion, type Variants, AnimatePresence } from "motion/react";

import { useCharactersOnStage } from "@player/hooks/useCharactersOnStage";
import { useCurrentSpeakers } from "@player/hooks/useCurrentSpeakers";
import { useLocation } from "@player/state/LocationContext";
import { useBookConvex } from "@player/context/BookConvexContext";
import CharacterCard from "./CharacterCard";
import { cn } from "@player/lib/utils";
import {
  useOptionalElementVisibility,
  useLastHideReason,
} from "@player/stores/elementVisibility.store";
import { type Appearance } from "@player/fetchers/getParagraphRange";

const AVATAR_SIZE = "clamp(55px, 6.5vw, 90px)";
const FADE_OUT_DURATION_MS = 3000;

const CharactersOnStagePanel = () => {
  const { charactersData } = useBookConvex();
  const allCharacters = charactersData;
  const charactersOnStage = useCharactersOnStage(allCharacters);
  const { location } = useLocation();
  const currentSpeakers = useCurrentSpeakers(location, allCharacters, true);

  const isOverlayVisible = useOptionalElementVisibility();
  const lastHideReason = useLastHideReason();

  // Safe screen width detection for SSR compatibility
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const [isOverlayEffectivelyVisible, setIsOverlayEffectivelyVisible] = useState(isOverlayVisible);

  useEffect(() => {
    if (isOverlayVisible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing derived visibility state
      setIsOverlayEffectivelyVisible(true);
      return;
    }

    if (lastHideReason === "inactivity" && isNarrowScreen) {
      const timeout = setTimeout(() => {
        setIsOverlayEffectivelyVisible(false);
      }, FADE_OUT_DURATION_MS);

      return () => clearTimeout(timeout);
    }

    setIsOverlayEffectivelyVisible(false);
  }, [isOverlayVisible, lastHideReason, isNarrowScreen]);

  useEffect(() => {
    const checkScreenWidth = () => setIsNarrowScreen(window.innerWidth < 1024);
    checkScreenWidth();
    window.addEventListener("resize", checkScreenWidth);
    return () => window.removeEventListener("resize", checkScreenWidth);
  }, []);

  const characterEntities = useMemo(() => {
    if (!location) return [];

    return charactersOnStage.map((character) => ({
      slug: character.slug,
      characterName: character.characterName,
      summary: "",
      imageUrl: "",
      chapterNumber: location.currentChapter || 0,
      paragraphNumber: location.currentParagraph || 0,
      isTalkingInFirstParagraph: currentSpeakers.includes(character.slug),
      otherAppearances: [],
    }));
  }, [charactersOnStage, location, currentSpeakers]);

  const shouldHideAvatars = isNarrowScreen && isOverlayEffectivelyVisible;

  return (
    <div
      className={cn(
        "characters-on-stage-panel w-full flex justify-center items-center max-w-full absolute bottom-2 lg:bottom-14 m-0 pointer-events-none",
        shouldHideAvatars ? "opacity-0" : "opacity-100",
      )}
    >
      <div className="relative w-full h-full overflow-x-auto no-scrollbar">
        <div
          className="min-w-max flex flex-nowrap justify-center gap-2 py-3 px-3 md:px-4 select-none"
          style={{ "--avatar-size": AVATAR_SIZE } as CSSProperties}
          role="list"
        >
          <AnimatePresence>
            {characterEntities.map((characterEntity, index) => (
              <CharacterAvatar
                key={characterEntity.slug}
                characterEntity={characterEntity}
                isSpeaking={currentSpeakers.includes(characterEntity.slug)}
                index={index}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
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
  isSpeaking: boolean;
  index: number;
}

const arePropsEqual = (prev: CharacterAvatarProps, next: CharacterAvatarProps) => {
  return (
    prev.characterEntity.slug === next.characterEntity.slug &&
    prev.isSpeaking === next.isSpeaking &&
    prev.index === next.index
  );
};

const CharacterAvatar = memo<CharacterAvatarProps>(({ characterEntity, isSpeaking, index }) => {
  return (
    <motion.div
      layout="position"
      variants={variants.character}
      initial="hidden"
      animate="visible"
      exit="exit"
      custom={index}
      role="listitem"
      layoutId={`character-${characterEntity.slug}`}
    >
      <div
        className={cn(
          "w-[var(--avatar-size)] h-[var(--avatar-size)] rounded-full border-2 pointer-events-auto",
          isSpeaking ? "speaking" : "not-speaking",
        )}
      >
        <CharacterCard
          entity={characterEntity}
          currentSpeakers={isSpeaking ? [characterEntity.slug] : []}
          disableHighlight
          imageOnly
          captionMode="hover-title"
        />
      </div>
    </motion.div>
  );
}, arePropsEqual);

const variants: { container: Variants; character: Variants } = {
  container: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
    exit: { opacity: 0, transition: { duration: 0.3 } },
  },
  character: {
    hidden: { opacity: 0, scale: 0.8, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { delay: i * 0.03, duration: 0.25, ease: "easeOut" },
    }),
    exit: { opacity: 0, scale: 0.7, y: -10, transition: { duration: 0.2 } },
  },
} as const;

export default CharactersOnStagePanel;
