import React, { useRef, useMemo, useCallback, useEffect } from "react";
import { motion } from "motion/react";

import CharacterMedia from "./CharacterMedia";
import { ParsedParagraphRange } from "@player/fetchers/getParagraphRange";
import { useCharacterModal } from "@player/stores/modals/characterModal.store";
import { cn } from "@player/lib/utils";
import { useHighlight } from "@player/hooks/useHighlight";
import { isVideoFile } from "@player/helpers/isVideoFile";
import { getPlaceholderFromVideoUrl } from "@player/utils/getPlaceholderFromVideoUrl";
import { useBookConvex } from "@player/context/BookConvexContext";
import { resolveCharacterSnapshot } from "@player/utils/characterOverrides";
import { getAvatarSource } from "@player/helpers/svgAvatars";
import { useAvatarGenerationStore } from "@player/stores/avatarGeneration.store";

type Appearance = { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean };

type CaptionMode = "always" | "hover" | "hover-title" | "never";

type CharacterCardProps = {
  entity: ParsedParagraphRange;
  currentSpeakers: string[];
  disableHighlight?: boolean;
  imageOnly?: boolean;
  captionMode?: CaptionMode;
};

const CharacterCard: React.FC<CharacterCardProps> = ({
  entity,
  currentSpeakers,
  disableHighlight = false,
  imageOnly = false,
  captionMode = "always",
}) => {
  const { openModal } = useCharacterModal();
  const { highlightParagraphs, isScrollingLocked } = useHighlight();
  const { charactersData } = useBookConvex();
  const optimisticAvatar = useAvatarGenerationStore(
    (state) => state.optimisticAvatars[entity.slug.toLowerCase()],
  );

  const characterData = useMemo(
    () => charactersData.find((character) => character.slug === entity.slug),
    [entity.slug, charactersData],
  );

  const locationRef = useMemo(
    () => ({ chapter: entity.chapterNumber, paragraph: entity.paragraphNumber }),
    [entity.chapterNumber, entity.paragraphNumber],
  );

  const snapshot = useMemo(
    () =>
      characterData
        ? resolveCharacterSnapshot(characterData, {
            location: locationRef,
            baseSummary: entity.summary,
            fallbackDisplayName: entity.characterName,
          })
        : null,
    [characterData, locationRef, entity.summary, entity.characterName],
  );

  const displayName = snapshot?.displayName ?? entity.characterName;
  const summary = snapshot?.summary ?? entity.summary;

  const cardRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);

  const apps = useMemo<Appearance[]>(
    () => [
      {
        chapterNumber: entity.chapterNumber,
        paragraphNumber: entity.paragraphNumber,
        isTalkingInParagraph: entity.isTalkingInFirstParagraph,
      },
      ...entity.otherAppearances,
    ],
    [
      entity.chapterNumber,
      entity.paragraphNumber,
      entity.isTalkingInFirstParagraph,
      entity.otherAppearances,
    ],
  );

  const isTalkingInCurrentRange = useMemo(
    () => currentSpeakers.includes(entity.slug),
    [currentSpeakers, entity.slug],
  );

  const svgFallback = useMemo(
    () =>
      getAvatarSource({
        slug: entity.slug,
        characterName: displayName,
        bookSlug: "",
        infoPerChapter: [],
      }),
    [entity.slug, displayName],
  );

  const mediaSrc = useMemo(() => {
    if (optimisticAvatar) return optimisticAvatar;
    const listeningUrl = snapshot?.media.listening ?? "";
    if (imageOnly) {
      const placeholder = getPlaceholderFromVideoUrl(listeningUrl);
      return placeholder || svgFallback;
    }
    return listeningUrl || svgFallback;
  }, [imageOnly, snapshot, svgFallback, optimisticAvatar]);

  const isVideo = imageOnly ? false : isVideoFile(mediaSrc);

  const modalMediaSrc = useMemo(() => {
    if (optimisticAvatar) return optimisticAvatar;
    if (imageOnly && snapshot) {
      const url = isTalkingInCurrentRange ? snapshot.media.talking : snapshot.media.listening;
      return url || svgFallback;
    }
    return snapshot?.media.listening || svgFallback;
  }, [imageOnly, isTalkingInCurrentRange, snapshot, svgFallback, optimisticAvatar]);

  const modalIsVideo = useMemo(() => isVideoFile(modalMediaSrc), [modalMediaSrc]);

  const requestToggle = useCallback(
    (enable: boolean) => {
      if (isScrollingLocked) return;

      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => highlightParagraphs(apps, enable));
    },
    [apps, highlightParagraphs, isScrollingLocked],
  );

  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  const commonAttrs = {
    "data-original-src": mediaSrc,
    "data-character-name": displayName,
    "data-summary": summary ?? "",
    className: "w-full h-full object-cover block",
  } as const;

  const isHoverish = captionMode === "hover" || captionMode === "hover-title";
  const captionVisibilityClasses =
    captionMode === "always"
      ? "opacity-100 translate-y-0"
      : isHoverish
        ? "opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
        : "hidden";

  return (
    <div
      ref={cardRef}
      className={cn(
        "group w-[clamp(60px,20vw,200px)] max-w-[200px] mx-auto relative pb-4 cursor-pointer",
      )}
      data-canonical-name={entity.slug}
      data-appearances={JSON.stringify(apps)}
      onMouseEnter={() => requestToggle(true)}
      onMouseLeave={() => requestToggle(false)}
      aria-label={displayName}
      title={displayName}
      onClick={() =>
        openModal({
          characterSlug: entity.slug,
          isVideo: modalIsVideo,
          mediaSrc: modalMediaSrc,
          chapter: entity.chapterNumber,
          paragraph: entity.paragraphNumber,
        })
      }
    >
      <motion.div
        className={cn(
          "relative rounded-full aspect-square isolate overflow-hidden transition-all duration-300 ease-in-out hover:scale-110 hover:z-10",
          !disableHighlight &&
            isTalkingInCurrentRange &&
            "z-10 animate-pulse-glow overflow-visible border-2 border-white/30",
        )}
      >
        <CharacterMedia
          mediaSrc={mediaSrc}
          commonAttrs={commonAttrs}
          isVideo={isVideo}
          canonicalName={entity.slug}
          isTalking={isTalkingInCurrentRange}
        />
      </motion.div>

      {captionMode !== "never" && (
        <div
          className={cn(
            "pointer-events-none max-w-full w-full absolute right-0 bottom-0 rounded-md sm:rounded-lg text-center bg-black/70 textured-bg shadow-lg sm:shadow-xl box-border z-20 title",
            "transition-all duration-200 ease-out will-change-transform will-change-opacity",
            captionVisibilityClasses,
          )}
          style={{
            border: isTalkingInCurrentRange
              ? "clamp(1px, 0.2vw, 2px) solid color-mix(in srgb, var(--text-light, #ffffff) 60%, transparent)"
              : "clamp(1px, 0.2vw, 2px) solid transparent",
          }}
        >
          <div className="py-0.5 px-1 sm:py-1 sm:px-2 md:py-1.5 md:px-3 flex flex-col items-center justify-center">
            <h4 className="w-full whitespace-nowrap overflow-hidden text-ellipsis text-[8px] sm:text-[10px] md:text-xs font-bold text-white tracking-wide uppercase">
              {entity.label || displayName}
            </h4>
            {summary && captionMode !== "hover-title" && (
              <p className="w-full whitespace-nowrap overflow-hidden text-ellipsis text-[7px] sm:text-[9px] md:text-xs italic text-gray-200">
                {summary}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterCard;
