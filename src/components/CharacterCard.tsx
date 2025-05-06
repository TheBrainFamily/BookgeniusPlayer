import React, { useCallback, useEffect, useRef, useMemo } from "react";
import { ParsedParagraphRange } from "@/src/fetchers/getParagraphRange";
import { getPictureFilePathForName, getMovingPictureFilePathForName } from "@/src/utils/getFilePathsForName";
import { CURRENT_BOOK } from "@/src/consts";

/* ------------------------------------------------------------------ */
type Appearance = { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean };

function toggleClasses(apps: Appearance[], enable: boolean) {
  apps.forEach(({ chapterNumber, paragraphNumber, isTalkingInParagraph }) => {
    const p = document.querySelector<HTMLElement>(`section[data-chapter="${chapterNumber}"] [data-index="${paragraphNumber}"]`);
    if (!p) return;
    p.classList.toggle("highlighted-paragraph", enable);
    p.classList.toggle("talking-paragraph", enable && isTalkingInParagraph);
  });
}

/* ------------------------------------------------------------------ */
interface Props {
  entity: ParsedParagraphRange;
  index: number; // position inside the panel (for stagger anim)
}
export const CharacterCard: React.FC<Props> = ({ entity, index }) => {
  const apps: Appearance[] = [
    { chapterNumber: entity.chapterNumber, paragraphNumber: entity.paragraphNumber, isTalkingInParagraph: entity.isTalkingInFirstParagraph },
    ...entity.otherAppearances,
  ];

  /* Determine if this character is talking in the current range */
  const isTalkingInCurrentRange = useMemo(() => {
    // We can use the entity's appearances to determine if it's talking in the current range
    return apps.some((app) => app.isTalkingInParagraph);
  }, [apps]);

  /* Use effect to apply the appropriate classes based on talking state */
  useEffect(() => {
    const cardElement = document.querySelector(`.entity-note[data-canonical-name="${entity.canonicalName.replace(/\"/g, "")}"]`);
    if (!cardElement) return;

    if (isTalkingInCurrentRange) {
      cardElement.classList.add("highlighted-talking-entity");

      // Update image to animated version if talking
      const imageElement = cardElement.querySelector<HTMLImageElement>(".entity-image");
      if (imageElement && imageElement.dataset.originalSrc) {
        const gifSrc = getMovingPictureFilePathForName(entity.canonicalName, CURRENT_BOOK);
        const currentSrcFilename = imageElement.src.split("/").pop();
        const gifSrcFilename = gifSrc.split("/").pop();
        if (currentSrcFilename !== gifSrcFilename) {
          imageElement.src = gifSrc;
        }
      }
    } else {
      cardElement.classList.add("highlighted-entity");

      // Ensure image is static version
      const imageElement = cardElement.querySelector<HTMLImageElement>(".entity-image");
      if (imageElement && imageElement.dataset.originalSrc) {
        const currentSrcFilename = imageElement.src.split("/").pop();
        const originalSrcFilename = imageElement.dataset.originalSrc.split("/").pop();
        if (currentSrcFilename !== originalSrcFilename) {
          imageElement.src = imageElement.dataset.originalSrc;
        }
      }
    }

    return () => {
      // Cleanup classes when component unmounts or updates
      cardElement.classList.remove("highlighted-talking-entity", "highlighted-entity");
    };
  }, [entity.canonicalName, isTalkingInCurrentRange, CURRENT_BOOK]);

  /* --------------------------------------------------------------- */
  /*  Smooth hover highlight                                         */
  /* --------------------------------------------------------------- */
  const wantOn = useRef(false);
  const rafId = useRef<number>(0);

  const requestToggle = useCallback(
    (enable: boolean) => {
      if ((window as unknown as { __sidebarScrollingLock: boolean }).__sidebarScrollingLock) return;
      if (wantOn.current === enable) return;
      wantOn.current = enable;
      cancelAnimationFrame(rafId.current!);
      rafId.current = requestAnimationFrame(() => toggleClasses(apps, enable));
    },
    [apps],
  );

  /* --------------------------------------------------------------- */
  /*  Media                                                          */
  /* --------------------------------------------------------------- */
  const mediaSrc = entity.imageUrl === "UNKNOWN" ? getPictureFilePathForName(entity.canonicalName, CURRENT_BOOK) : entity.imageUrl;
  const isVideo = mediaSrc.endsWith(".mp4") || mediaSrc.endsWith(".webm");

  const openDetails = () => typeof window.showCharacterDetailsModal === "function" && window.showCharacterDetailsModal(entity.canonicalName, mediaSrc, entity.summary ?? "");

  const commonAttrs = { "data-original-src": mediaSrc, "data-character-name": entity.canonicalName, "data-summary": entity.summary ?? "", className: "entity-image" } as const;

  const summaryHTML = (entity.summary || "").replace(/\n\n/g, "<br/>").replace(/\n/g, "<br/>").replace(/•/g, "");

  /* custom CSS property for stagger delay */
  const style = { ["--stagger-delay"]: `${index * 0.13}s` };

  return (
    <div
      className="entity-note sidebar-item-animate"
      data-canonical-name={entity.canonicalName}
      data-appearances={JSON.stringify(apps)}
      style={style}
      onMouseEnter={() => requestToggle(true)}
      onMouseLeave={() => requestToggle(false)}
    >
      <div className="entity-image-column">
        <div className="entity-image-wrapper" onClick={openDetails}>
          {isVideo ? <video {...commonAttrs} src={mediaSrc} autoPlay loop muted playsInline /> : <img {...commonAttrs} src={mediaSrc} alt={entity.canonicalName} />}
        </div>
      </div>

      <div className="entity-text-column">
        <h4 className="editable-text">{entity.label || entity.canonicalName}</h4>
        <p dangerouslySetInnerHTML={{ __html: summaryHTML }} />
      </div>
    </div>
  );
};
