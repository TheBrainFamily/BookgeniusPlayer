import React, { useCallback, useRef } from "react";
import { ParsedParagraphRange } from "@/src/fetchers/getParagraphRange";
import { getPictureFilePathForName } from "@/src/utils/getFilePathsForName";
import { getCurrentBookSlug } from "@/src/getCurrentBookSlug";

/* ------------------------------------------------------------------ */
type Appearance = { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean };

function toggleClasses(apps: Appearance[], enable: boolean) {
  apps.forEach(({ chapterNumber, paragraphNumber, isTalkingInParagraph }) => {
    // eslint‑disable-next-line prefer-template
    const q = `section[data-chapter="${chapterNumber}"] [data-index="${paragraphNumber}"]`;
    const p = document.querySelector<HTMLElement>(q);
    if (!p) return;
    p.classList.toggle("highlighted-paragraph", enable);
    p.classList.toggle("talking-paragraph", enable && isTalkingInParagraph);
  });
}

/* ------------------------------------------------------------------ */
interface Props {
  entity: ParsedParagraphRange;
}
export const CharacterCard: React.FC<Props> = ({ entity }) => {
  const bookSlug = getCurrentBookSlug();

  /* merged appearance list (first + others) */
  const apps: Appearance[] = [
    { chapterNumber: entity.chapterNumber, paragraphNumber: entity.paragraphNumber, isTalkingInParagraph: entity.isTalkingInFirstParagraph },
    ...entity.otherAppearances,
  ];

  /* --------------------------------------------------------------- */
  /*  Hover logic throttled to rAF and only if state really changes  */
  /* --------------------------------------------------------------- */
  const wantOn = useRef(false);
  const rafId = useRef<number>();

  const requestToggle = useCallback(
    (enable: boolean) => {
      if ((window as any).__sidebarScrollingLock) return; // ignore while scrolling
      if (wantOn.current === enable) return; // nothing to do

      wantOn.current = enable;
      cancelAnimationFrame(rafId.current!);
      rafId.current = requestAnimationFrame(() => toggleClasses(apps, enable));
    },
    [apps],
  );

  /* --------------------------------------------------------------- */
  /*  Modal open                                                     */
  /* --------------------------------------------------------------- */
  const mediaSrc = entity.imageUrl === "UNKNOWN" ? getPictureFilePathForName(entity.canonicalName, bookSlug) : entity.imageUrl;
  const isVideo = mediaSrc.endsWith(".mp4") || mediaSrc.endsWith(".webm");

  const openDetails = () => typeof window.showCharacterDetailsModal === "function" && window.showCharacterDetailsModal(entity.canonicalName, mediaSrc, entity.summary ?? "");

  const common = { "data-original-src": mediaSrc, "data-character-name": entity.canonicalName, "data-summary": entity.summary ?? "", className: "entity-image" } as const;

  const summaryHTML = (entity.summary || "").replace(/\n\n/g, "<br/>").replace(/\n/g, "<br/>").replace(/•/g, "");

  return (
    <div
      className="entity-note"
      data-canonical-name={entity.canonicalName}
      data-appearances={JSON.stringify(apps)}
      onMouseEnter={() => requestToggle(true)}
      onMouseLeave={() => requestToggle(false)}
    >
      <div className="entity-image-column">
        <div className="entity-image-wrapper" onClick={openDetails}>
          {isVideo ? <video {...common} src={mediaSrc} autoPlay loop muted playsInline /> : <img {...common} src={mediaSrc} alt={entity.canonicalName} />}
        </div>
      </div>

      <div className="entity-text-column">
        <h4 className="editable-text">{entity.label || entity.canonicalName}</h4>
        <p dangerouslySetInnerHTML={{ __html: summaryHTML }} />
      </div>
    </div>
  );
};
