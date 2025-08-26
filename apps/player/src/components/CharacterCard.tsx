import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "motion/react";

import CharacterMedia from "./CharacterMedia";
import { ParsedParagraphRange } from "@player/fetchers/getParagraphRange";
import { getListeningMediaFilePathForName, getTalkingMediaFilePathForName } from "@player/utils/getFilePathsForName";
import { bookDataLoader } from "@player/services/bookDataLoader";
import { useCharacterModal } from "@player/stores/modals/characterModal.store";
import { cn } from "@player/lib/utils";
import { useHighlight } from "@player/hooks/useHighlight";
import { isVideoFile } from "@player/helpers/isVideoFile";

type Appearance = { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean };

type CharacterCardProps = { entity: ParsedParagraphRange; currentSpeakers: string[]; hideTitle?: boolean; disableHighlight?: boolean; imageOnly?: boolean };

const CharacterCard: React.FC<CharacterCardProps> = ({ entity, currentSpeakers, hideTitle = false, disableHighlight = false, imageOnly = false }) => {
  const { openModal } = useCharacterModal();
  const { highlightParagraphs, isScrollingLocked } = useHighlight();

  const cardRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number>(0);

  const apps: Appearance[] = [
    { chapterNumber: entity.chapterNumber, paragraphNumber: entity.paragraphNumber, isTalkingInParagraph: entity.isTalkingInFirstParagraph },
    ...entity.otherAppearances,
  ];

  const isTalkingInCurrentRange = useMemo(() => {
    return currentSpeakers.includes(entity.slug);
  }, [currentSpeakers, entity.slug]);
  const [currentMediaSrc, setCurrentMediaSrc] = useState("");

  useEffect(() => {
    if (!cardRef.current) return;

    if (imageOnly) {
      //TODO do not add this logic all around the frontend, we have a function that does it
      const imageSrc = entity.imageUrl || getListeningMediaFilePathForName(entity.slug, bookDataLoader.getCurrentBook()).replace(/-(listens|speaks)\.(mp4|webm)/, ".png");
      setCurrentMediaSrc(imageSrc);
    } else if (isTalkingInCurrentRange) {
      setCurrentMediaSrc(getTalkingMediaFilePathForName(entity.slug, bookDataLoader.getCurrentBook()));
    } else {
      setCurrentMediaSrc(getListeningMediaFilePathForName(entity.slug, bookDataLoader.getCurrentBook()));
    }
  }, [isTalkingInCurrentRange, entity.slug, entity.imageUrl, imageOnly]);

  const requestToggle = useCallback(
    (enable: boolean) => {
      if (isScrollingLocked) return;

      if (rafIdRef.current !== undefined) {
        cancelAnimationFrame(rafIdRef.current);
      }

      rafIdRef.current = requestAnimationFrame(() => highlightParagraphs(apps, enable));
    },
    [apps, highlightParagraphs, isScrollingLocked],
  );

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== undefined) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const mediaSrc = currentMediaSrc || getListeningMediaFilePathForName(entity.slug, bookDataLoader.getCurrentBook());
  const isVideo = imageOnly ? false : isVideoFile(mediaSrc);
  const modalMediaSrc = imageOnly
    ? isTalkingInCurrentRange
      ? getTalkingMediaFilePathForName(entity.slug, bookDataLoader.getCurrentBook())
      : getListeningMediaFilePathForName(entity.slug, bookDataLoader.getCurrentBook())
    : mediaSrc;
  const modalIsVideo = isVideoFile(modalMediaSrc);

  const commonAttrs = {
    "data-original-src": mediaSrc,
    "data-character-name": entity.slug,
    "data-summary": entity.summary ?? "",
    className: "w-full h-full object-cover block",
  } as const;

  return (
    <div
      ref={cardRef}
      className={cn("w-[clamp(60px,15vw,200px)] max-w-[200px] mx-auto relative pb-4 cursor-pointer")}
      data-canonical-name={entity.slug}
      data-appearances={JSON.stringify(apps)}
      onMouseEnter={() => requestToggle(true)}
      onMouseLeave={() => requestToggle(false)}
      aria-label={entity.characterName}
      onClick={() => openModal({ characterSlug: entity.slug, isVideo: modalIsVideo, mediaSrc: modalMediaSrc })}
    >
      <motion.div
        layout
        className={cn(
          "relative rounded-full overflow-hidden aspect-square isolate",
          disableHighlight
            ? ""
            : isTalkingInCurrentRange
              ? "z-10 shadow-lg border-2 border-(--book-primary-color) animate-pulse-glow"
              : "transition-transform duration-300 ease-in-out hover:scale-110 hover:z-10",
        )}
        title={entity.characterName}
      >
        <CharacterMedia mediaSrc={mediaSrc} commonAttrs={commonAttrs} isVideo={isVideo} canonicalName={entity.slug} isTalking={isTalkingInCurrentRange} />
      </motion.div>
      {!hideTitle && (
        <div
          className={cn(
            "max-w-full w-full absolute right-0 bottom-0 rounded-md sm:rounded-lg text-center bg-black/70 textured-bg border shadow-lg sm:shadow-xl box-border z-20",
            "border-[1px] sm:border-2",
            isTalkingInCurrentRange ? "border-(--book-primary-color) transition-all duration-300 ease-in-out" : "border-transparent transition-all duration-200 ease-in-out",
          )}
        >
          <div className="py-0.5 px-1 sm:py-1 sm:px-2 md:py-1.5 md:px-3 flex flex-col items-center justify-center">
            <h4 className="w-full whitespace-nowrap overflow-hidden overflow-ellipsis text-[8px] sm:text-[10px] md:text-xs font-bold text-white tracking-wide uppercase">
              {entity.label || entity.characterName}
            </h4>
            <p
              className={cn(
                "w-full whitespace-nowrap overflow-hidden overflow-ellipsis text-[7px] sm:text-[9px] md:text-xs text-gray-200 italic",
                isTalkingInCurrentRange ? "" : "text-gray-200",
              )}
            >
              {entity.summary}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterCard;
