import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CharacterMedia from "./CharacterMedia";
import { ParsedParagraphRange } from "@/fetchers/getParagraphRange";
import { getListeningMediaFilePathForName, getTalkingMediaFilePathForName } from "@/utils/getFilePathsForName";
import { CURRENT_BOOK } from "@/consts";
import { useCharacterModal } from "@/stores/modals/characterModal.store";
import { useHighlight } from "@/context/HighlightContext";
import { cn } from "@/lib/utils";

type Appearance = { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean };

interface CharacterCardProps {
  entity: ParsedParagraphRange;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ entity }) => {
  const { openModal } = useCharacterModal();
  const { highlightParagraphs, isScrollingLocked } = useHighlight();

  const cardRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number>(0);

  const apps: Appearance[] = [
    { chapterNumber: entity.chapterNumber, paragraphNumber: entity.paragraphNumber, isTalkingInParagraph: entity.isTalkingInFirstParagraph },
    ...entity.otherAppearances,
  ];

  const isTalkingInCurrentRange = useMemo(() => apps.some((app) => app.isTalkingInParagraph), [apps]);
  const [currentMediaSrc, setCurrentMediaSrc] = useState("");

  useEffect(() => {
    if (!cardRef.current) return;

    if (isTalkingInCurrentRange) {
      setCurrentMediaSrc(getTalkingMediaFilePathForName(entity.slug, CURRENT_BOOK));
    } else {
      setCurrentMediaSrc(getListeningMediaFilePathForName(entity.slug, CURRENT_BOOK));
    }
  }, [isTalkingInCurrentRange, entity.slug, entity.imageUrl]);

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

  const mediaSrc = currentMediaSrc || getListeningMediaFilePathForName(entity.slug, CURRENT_BOOK);
  const isVideo = mediaSrc.endsWith(".mp4") || mediaSrc.endsWith(".webm");

  const commonAttrs = { "data-original-src": mediaSrc, "data-character-name": entity.slug, "data-summary": entity.summary ?? "", className: "w-full h-full object-cover" } as const;

  return (
    <div
      ref={cardRef}
      className={cn("w-[85%] max-w-[200px] mx-auto relative pb-4")}
      data-canonical-name={entity.slug}
      data-appearances={JSON.stringify(apps)}
      onMouseEnter={() => requestToggle(true)}
      onMouseLeave={() => requestToggle(false)}
    >
      <div
        className={cn(
          "rounded-full overflow-hidden aspect-square cursor-pointer",
          isTalkingInCurrentRange
            ? "z-10 shadow-lg border-2 border-(--book-primary-color) animate-pulse-glow"
            : "transition-transform duration-300 ease-in-out hover:scale-110 hover:z-10",
        )}
        onClick={() => openModal(entity.slug, isTalkingInCurrentRange, mediaSrc)}
      >
        <CharacterMedia mediaSrc={mediaSrc} commonAttrs={commonAttrs} isVideo={isVideo} canonicalName={entity.slug} isTalking={isTalkingInCurrentRange} />
      </div>
      <div
        className={cn(
          "max-w-full w-full absolute right-0 bottom-0 rounded-xl text-center bg-black/70 textured-bg border shadow-xl",
          isTalkingInCurrentRange ? "border-2 border-(--book-primary-color) transition-all duration-300 ease-in-out" : "border-white/30 transition-all duration-200 ease-in-out",
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
    </div>
  );
};

export default CharacterCard;
