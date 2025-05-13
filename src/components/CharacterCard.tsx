import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CharacterMedia from "./CharacterMedia";
import { ParsedParagraphRange } from "@/fetchers/getParagraphRange";
import { getListeningMediaFilePathForName, getTalkingMediaFilePathForName } from "@/utils/getFilePathsForName";
import { CURRENT_BOOK } from "@/consts";
import { useModal } from "@/context/ModalContext";
import { formatSummaryHTML } from "@/utils/formatters";
import { useHighlight } from "@/context/HighlightContext";
import { cn } from "@/lib/utils";

type Appearance = { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean };

interface CharacterCardProps {
  entity: ParsedParagraphRange;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ entity }) => {
  const { openModal } = useModal();
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
      setCurrentMediaSrc(getTalkingMediaFilePathForName(entity.canonicalName, CURRENT_BOOK));
    } else {
      const staticSrc = entity.imageUrl === "UNKNOWN" ? getListeningMediaFilePathForName(entity.canonicalName, CURRENT_BOOK) : entity.imageUrl;
      setCurrentMediaSrc(staticSrc);
    }
  }, [isTalkingInCurrentRange, entity.canonicalName, entity.imageUrl]);

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

  const mediaSrc = currentMediaSrc || (entity.imageUrl === "UNKNOWN" ? getListeningMediaFilePathForName(entity.canonicalName, CURRENT_BOOK) : entity.imageUrl);
  const isVideo = mediaSrc.endsWith(".mp4") || mediaSrc.endsWith(".webm");

  const summaryHTML = formatSummaryHTML(entity.summary);
  const commonAttrs = {
    "data-original-src": mediaSrc,
    "data-character-name": entity.canonicalName,
    "data-summary": entity.summary ?? "",
    className: "w-full h-full object-cover",
  } as const;

  const openDetailsModal = () => {
    openModal(
      <div className="flex flex-row lg:flex-col gap-4 max-w-full lg:max-w-120 max-h-full">
        <div className="rounded-full overflow-hidden max-h-[90vh] max-w-[90vh] lg:max-h-120 lg:max-w-120 border-4 border-(--book-primary-color) aspect-square">
          <CharacterMedia mediaSrc={mediaSrc} commonAttrs={commonAttrs} isVideo={isVideo} canonicalName={entity.canonicalName} />
        </div>
        <div className="flex flex-col self-center p-4 rounded-lg bg-(--book-secondary-color)/70 border-2 border-(--book-primary-color) text-white">
          <h4 className="italic font-bold text-center">{entity.label || entity.canonicalName}</h4>
          <p className="text-center" dangerouslySetInnerHTML={{ __html: summaryHTML }} />
        </div>
      </div>,
    );
  };

  return (
    <div
      ref={cardRef}
      className={cn("w-[85%] max-w-[200px] mx-auto relative pb-4")}
      data-canonical-name={entity.canonicalName}
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
        onClick={openDetailsModal}
      >
        <CharacterMedia mediaSrc={mediaSrc} commonAttrs={commonAttrs} isVideo={isVideo} canonicalName={entity.canonicalName} isTalking={isTalkingInCurrentRange} />
      </div>
      <div
        className={cn(
          "max-w-full w-full absolute right-0 bottom-0 rounded-sm text-center bg-(--book-secondary-color)/70",
          isTalkingInCurrentRange
            ? "border-t-2 border-(--book-primary-color) shadow-lg transition-all duration-300 ease-in-out"
            : "border-t border-gray-400/30 shadow transition-all duration-200 ease-in-out",
        )}
      >
        <div className="py-1.5 px-3 flex flex-col items-center justify-center">
          <h4 className="w-full whitespace-nowrap overflow-hidden overflow-ellipsis text-xs font-bold text-white tracking-wide uppercase">
            {entity.label || entity.canonicalName}
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
