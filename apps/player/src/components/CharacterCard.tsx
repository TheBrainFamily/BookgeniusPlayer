import React, { useRef, useMemo, useCallback, useEffect } from "react";
import { motion } from "motion/react";

import CharacterMedia from "./CharacterMedia";
import { ParsedParagraphRange } from "@player/fetchers/getParagraphRange";
import { getListeningMediaFilePathForName, getTalkingMediaFilePathForName } from "@player/utils/getFilePathsForName";
import { bookDataLoader } from "@player/services/bookDataLoader";
import { useCharacterModal } from "@player/stores/modals/characterModal.store";
import { cn } from "@player/lib/utils";
import { useHighlight } from "@player/hooks/useHighlight";
import { isVideoFile } from "@player/helpers/isVideoFile";
import { getPlaceholderFromVideoUrl } from "@player/utils/getPlaceholderFromVideoUrl";

type Appearance = { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean };

type CaptionMode = "always" | "hover" | "never";

type CharacterCardProps = { entity: ParsedParagraphRange; currentSpeakers: string[]; disableHighlight?: boolean; imageOnly?: boolean; captionMode?: CaptionMode };

const CharacterCard: React.FC<CharacterCardProps> = ({ entity, currentSpeakers, disableHighlight = false, imageOnly = false, captionMode = "always" }) => {
  const { openModal } = useCharacterModal();
  const { highlightParagraphs, isScrollingLocked } = useHighlight();

  const cardRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);

  const apps = useMemo<Appearance[]>(
    () => [{ chapterNumber: entity.chapterNumber, paragraphNumber: entity.paragraphNumber, isTalkingInParagraph: entity.isTalkingInFirstParagraph }, ...entity.otherAppearances],
    [entity.chapterNumber, entity.paragraphNumber, entity.isTalkingInFirstParagraph, entity.otherAppearances],
  );

  const isTalkingInCurrentRange = useMemo(() => currentSpeakers.includes(entity.slug), [currentSpeakers, entity.slug]);

  const mediaSrc = useMemo(() => {
    const book = bookDataLoader.getCurrentBook();
    if (imageOnly) {
      const base = entity.imageUrl || getListeningMediaFilePathForName(entity.slug, book);
      return getPlaceholderFromVideoUrl(base);
    }

    return isTalkingInCurrentRange ? getTalkingMediaFilePathForName(entity.slug, book) : getListeningMediaFilePathForName(entity.slug, book);
  }, [imageOnly, entity.imageUrl, entity.slug, isTalkingInCurrentRange]);

  const isVideo = imageOnly ? false : isVideoFile(mediaSrc);

  const modalMediaSrc = useMemo(() => {
    const book = bookDataLoader.getCurrentBook();
    if (imageOnly) {
      return isTalkingInCurrentRange ? getTalkingMediaFilePathForName(entity.slug, book) : getListeningMediaFilePathForName(entity.slug, book);
    }

    return mediaSrc;
  }, [imageOnly, isTalkingInCurrentRange, entity.slug, mediaSrc]);

  const modalIsVideo = isVideoFile(modalMediaSrc);

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
    "data-character-name": entity.slug,
    "data-summary": entity.summary ?? "",
    className: "w-full h-full object-cover block",
  } as const;

  const captionVisibilityClasses =
    captionMode === "always"
      ? "opacity-100 translate-y-0"
      : captionMode === "hover"
        ? "opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
        : "hidden";

  return (
    <div
      ref={cardRef}
      className={cn("group w-[clamp(60px,15vw,200px)] max-w-[200px] mx-auto relative pb-4 cursor-pointer")}
      data-canonical-name={entity.slug}
      data-appearances={JSON.stringify(apps)}
      onMouseEnter={() => requestToggle(true)}
      onMouseLeave={() => requestToggle(false)}
      aria-label={entity.characterName}
      title={entity.characterName}
      onClick={() => openModal({ characterSlug: entity.slug, isVideo: modalIsVideo, mediaSrc: modalMediaSrc })}
    >
      <motion.div
        layout
        className={cn(
          "relative rounded-full aspect-square isolate",
          disableHighlight
            ? ""
            : isTalkingInCurrentRange
              ? "z-10 shadow-lg border-2 border-(--book-primary-color) animate-pulse-glow"
              : "transition-transform duration-300 ease-in-out hover:scale-110 hover:z-10",
        )}
      >
        <CharacterMedia mediaSrc={mediaSrc} commonAttrs={commonAttrs} isVideo={isVideo} canonicalName={entity.slug} isTalking={isTalkingInCurrentRange} />
      </motion.div>

      {captionMode !== "never" && (
        <div
          className={cn(
            "pointer-events-none max-w-full w-full absolute right-0 bottom-0 rounded-md sm:rounded-lg text-center bg-black/70 textured-bg border shadow-lg sm:shadow-xl box-border z-20 title",
            "border-[1px] sm:border-2 transition-all duration-200 ease-out will-change-transform will-change-opacity",
            isTalkingInCurrentRange ? "border-(--book-primary-color)" : "border-transparent",
            captionVisibilityClasses,
          )}
        >
          <div className="py-0.5 px-1 sm:py-1 sm:px-2 md:py-1.5 md:px-3 flex flex-col items-center justify-center">
            <h4 className="w-full whitespace-nowrap overflow-hidden text-ellipsis text-[8px] sm:text-[10px] md:text-xs font-bold text-white tracking-wide uppercase">
              {entity.label || entity.characterName}
            </h4>
            {entity.summary && <p className="w-full whitespace-nowrap overflow-hidden text-ellipsis text-[7px] sm:text-[9px] md:text-xs italic text-gray-200">{entity.summary}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterCard;
