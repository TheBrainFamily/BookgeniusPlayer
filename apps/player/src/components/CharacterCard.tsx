import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "motion/react";

import CharacterMedia from "./CharacterMedia";
import { ParsedParagraphRange } from "@/fetchers/getParagraphRange";
import { getListeningMediaFilePathForName, getTalkingMediaFilePathForName } from "@/utils/getFilePathsForName";
import { bookDataLoader } from "@/services/bookDataLoader";
import { useCharacterModal } from "@/stores/modals/characterModal.store";
import { cn } from "@/lib/utils";
import { useHighlight } from "@/hooks/useHighlight";

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
      const imageSrc = entity.imageUrl || getListeningMediaFilePathForName(entity.slug, bookDataLoader.getCurrentBook()).replace(/-(listens|speaks)\.(mp4|webm)$/, ".png");
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
  const isVideo = imageOnly ? false : mediaSrc.endsWith(".mp4") || mediaSrc.endsWith(".webm");
  const modalMediaSrc = imageOnly
    ? isTalkingInCurrentRange
      ? getTalkingMediaFilePathForName(entity.slug, bookDataLoader.getCurrentBook())
      : getListeningMediaFilePathForName(entity.slug, bookDataLoader.getCurrentBook())
    : mediaSrc;
  const modalIsVideo = modalMediaSrc.endsWith(".mp4") || modalMediaSrc.endsWith(".webm");

  const commonAttrs = { "data-original-src": mediaSrc, "data-character-name": entity.slug, "data-summary": entity.summary ?? "", className: "w-full h-full object-cover" } as const;

  return (
    <div
      ref={cardRef}
      className={cn("w-[85%] max-w-[200px] mx-auto relative pb-4")}
      data-canonical-name={entity.slug}
      data-appearances={JSON.stringify(apps)}
      onMouseEnter={() => requestToggle(true)}
      onMouseLeave={() => requestToggle(false)}
      title={entity.characterName}
      aria-label={entity.characterName}
    >
      <motion.div
        layout
        className={cn(
          "rounded-full aspect-square cursor-pointer",
          disableHighlight
            ? ""
            : isTalkingInCurrentRange
              ? "z-10 shadow-lg border-2 border-(--book-primary-color) animate-pulse-glow"
              : "transition-transform duration-300 ease-in-out hover:scale-110 hover:z-10",
        )}
        onClick={() => openModal(entity.slug, modalIsVideo, modalMediaSrc)}
      >
        <CharacterMedia mediaSrc={mediaSrc} commonAttrs={commonAttrs} isVideo={isVideo} canonicalName={entity.slug} isTalking={isTalkingInCurrentRange} />
      </motion.div>
      {!hideTitle && (
        <div
          className={cn(
            "max-w-full w-full absolute right-0 bottom-0 rounded-xl text-center bg-black/70 textured-bg border-2 shadow-xl box-border",
            isTalkingInCurrentRange ? "border-(--book-primary-color) transition-all duration-300 ease-in-out" : "border-transparent transition-all duration-200 ease-in-out",
          )}
        >
          <div className="py-1.5 px-3 flex flex-col items-center justify-center">
            <h4 className="w-full whitespace-nowrap overflow-hidden overflow-ellipsis text-xs font-bold text-white tracking-wide uppercase">
              {entity.label || entity.characterName}
            </h4>
            <p className={cn("w-full whitespace-nowrap overflow-hidden overflow-ellipsis text-xs text-gray-200 italic", isTalkingInCurrentRange ? "" : "text-gray-200")}>
              {entity.summary}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterCard;
