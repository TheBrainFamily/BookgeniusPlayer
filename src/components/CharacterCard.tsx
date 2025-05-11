import React, { useCallback, useEffect, useRef, useMemo, useState } from "react";

import { ParsedParagraphRange } from "@/fetchers/getParagraphRange";
import { getPictureFilePathForName, getMovingPictureFilePathForName } from "@/utils/getFilePathsForName";
import { CURRENT_BOOK } from "@/consts";
import { useModal } from "@/context/ModalContext";
import { useHighlight } from "@/context/HighlightContext";

type Appearance = { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean };

function formatSummaryHTML(summary: string = ""): string {
  return summary.replace(/\n\n/g, "<br/>").replace(/\n/g, "<br/>").replace(/•/g, "");
}

interface CharacterMediaProps {
  mediaSrc: string;
  commonAttrs: { "data-original-src": string; "data-character-name": string; "data-summary": string; className: string };
  isVideo: boolean;
  canonicalName: string;
}

const CharacterMedia: React.FC<CharacterMediaProps> = ({ mediaSrc, commonAttrs, isVideo, canonicalName }) => {
  const [videoA_Src, setVideoA_Src] = useState<string>("");
  const [videoB_Src, setVideoB_Src] = useState<string>("");
  const [videoA_Loaded, setVideoA_Loaded] = useState<boolean>(false);
  const [videoB_Loaded, setVideoB_Loaded] = useState<boolean>(false);
  const [isA_Current, setIsA_Current] = useState<boolean>(true); // Video A is current by default

  // Effect for initial video load or when mediaSrc is an image
  useEffect(() => {
    if (isVideo && videoA_Src === "" && videoB_Src === "" && mediaSrc !== "") {
      // Initial load: set video A as the first source
      setVideoA_Loaded(false);
      setVideoA_Src(mediaSrc);
      setIsA_Current(true); // Ensure A is current
    } else if (!isVideo && mediaSrc) {
      // Handle initial image or change to image
      setVideoA_Src(mediaSrc); // Use videoA slot for image src
      setVideoA_Loaded(true); // Assume images load instantly
      setVideoB_Src(""); // Clear videoB
      setVideoB_Loaded(false);
      setIsA_Current(true); // Show A (which will render an img tag)
    }
  }, [mediaSrc, isVideo]);

  // Main effect to manage video source changes and trigger loading on standby
  useEffect(() => {
    if (!isVideo) {
      // If it's an image, ensure videoA_Src is set and it's current
      if (videoA_Src !== mediaSrc) setVideoA_Src(mediaSrc);
      if (!isA_Current) setIsA_Current(true);
      setVideoA_Loaded(true); // Images are considered loaded
      if (videoB_Src !== "") setVideoB_Src(""); // Clear standby video
      setVideoB_Loaded(false);
      return;
    }

    // Logic for videos:
    const currentVideoPlayerSrc = isA_Current ? videoA_Src : videoB_Src;
    const currentVideoPlayerLoaded = isA_Current ? videoA_Loaded : videoB_Loaded;

    if (currentVideoPlayerSrc === mediaSrc && currentVideoPlayerLoaded) {
      // Current video is already showing the correct, loaded media. Nothing to do.
      return;
    }

    // If the target mediaSrc is already in one of the players and loaded, switch if necessary
    if (videoA_Src === mediaSrc && videoA_Loaded && !isA_Current) {
      setIsA_Current(true);
      return;
    }
    if (videoB_Src === mediaSrc && videoB_Loaded && isA_Current) {
      setIsA_Current(false);
      return;
    }

    // Load mediaSrc into the standby video player
    if (isA_Current) {
      // A is current, B is standby
      if (videoB_Src !== mediaSrc) {
        setVideoB_Loaded(false);
        setVideoB_Src(mediaSrc); // Load into B
      }
      // If B is already loading mediaSrc, onLoadedData will handle the switch
    } else {
      // B is current, A is standby
      if (videoA_Src !== mediaSrc) {
        setVideoA_Loaded(false);
        setVideoA_Src(mediaSrc); // Load into A
      }
      // If A is already loading mediaSrc, onLoadedData will handle the switch
    }
  }, [mediaSrc, isVideo, isA_Current, videoA_Src, videoB_Src, videoA_Loaded, videoB_Loaded]);

  const handleLoadedData = (videoIdentity: "A" | "B") => {
    if (videoIdentity === "A") {
      setVideoA_Loaded(true);
      if (videoA_Src === mediaSrc && !isA_Current) {
        // If A just loaded the target media and B is current
        setIsA_Current(true);
      }
    } else if (videoIdentity === "B") {
      setVideoB_Loaded(true);
      if (videoB_Src === mediaSrc && isA_Current) {
        // If B just loaded the target media and A is current
        setIsA_Current(false);
      }
    }
  };

  if (!isVideo) {
    // For images, render a simple img tag.
    return <img {...commonAttrs} src={mediaSrc || videoA_Src} alt={canonicalName} />;
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <video
        key="videoA"
        {...commonAttrs}
        src={videoA_Src}
        style={{ opacity: videoA_Loaded ? 1 : 0, transition: "opacity 0.3s ease-in-out", position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
        autoPlay
        loop
        muted
        playsInline
        onLoadedData={() => videoA_Src && handleLoadedData("A")}
        onError={() => {
          console.error(`Error loading video A: ${videoA_Src}`);
          setVideoA_Loaded(false); /* Optionally try to reload or clear */
        }}
      />
      <video
        key="videoB"
        {...commonAttrs}
        src={videoB_Src}
        style={{
          opacity: !isA_Current && videoB_Loaded ? 1 : 0,
          transition: "opacity 0.3s ease-in-out",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
        autoPlay
        loop
        muted
        playsInline
        onLoadedData={() => videoB_Src && handleLoadedData("B")}
        onError={() => {
          console.error(`Error loading video B: ${videoB_Src}`);
          setVideoB_Loaded(false); /* Optionally try to reload or clear */
        }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
interface CharacterCardProps {
  entity: ParsedParagraphRange;
  index: number; // position inside the panel (for stagger anim)
}

export const CharacterCard: React.FC<CharacterCardProps> = ({ entity, index }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const apps: Appearance[] = [
    { chapterNumber: entity.chapterNumber, paragraphNumber: entity.paragraphNumber, isTalkingInParagraph: entity.isTalkingInFirstParagraph },
    ...entity.otherAppearances,
  ];

  /* Determine if this character is talking in the current range */
  const isTalkingInCurrentRange = useMemo(() => {
    // We can use the entity's appearances to determine if it's talking in the current range
    return apps.some((app) => app.isTalkingInParagraph);
  }, [apps]); /* State for managing the media source */
  const [currentMediaSrc, setCurrentMediaSrc] = useState("");

  /* Use effect to apply the appropriate classes based on talking state */
  useEffect(() => {
    if (!cardRef.current) return;

    cardRef.current.classList.remove("highlighted-talking-entity", "highlighted-entity");

    if (isTalkingInCurrentRange) {
      cardRef.current.classList.add("highlighted-talking-entity");

      const talkingSrc = getMovingPictureFilePathForName(entity.canonicalName, CURRENT_BOOK);
      setCurrentMediaSrc(talkingSrc);
    } else {
      cardRef.current.classList.add("highlighted-entity");

      // Set to static version
      const staticSrc = entity.imageUrl === "UNKNOWN" ? getPictureFilePathForName(entity.canonicalName, CURRENT_BOOK) : entity.imageUrl;
      setCurrentMediaSrc(staticSrc);
    }
  }, [isTalkingInCurrentRange, entity.canonicalName, CURRENT_BOOK, entity.imageUrl]);

  /* --------------------------------------------------------------- */
  /*  Smooth hover highlight                                         */
  /* --------------------------------------------------------------- */
  const wantOn = useRef(false);
  const rafId = useRef<number>(0);
  const { highlightParagraphs, isScrollingLocked } = useHighlight();

  const requestToggle = useCallback(
    (enable: boolean) => {
      if (isScrollingLocked) return;
      if (wantOn.current === enable) return;
      wantOn.current = enable;
      cancelAnimationFrame(rafId.current!);
      rafId.current = requestAnimationFrame(() => highlightParagraphs(apps, enable));
    },
    [apps, highlightParagraphs, isScrollingLocked],
  );

  /* --------------------------------------------------------------- */
  /*  Media                                                          */
  /* --------------------------------------------------------------- */
  const mediaSrc = currentMediaSrc || (entity.imageUrl === "UNKNOWN" ? getPictureFilePathForName(entity.canonicalName, CURRENT_BOOK) : entity.imageUrl);
  const isVideo = mediaSrc.endsWith(".mp4") || mediaSrc.endsWith(".webm");

  const summaryHTML = formatSummaryHTML(entity.summary);
  const commonAttrs = { "data-original-src": mediaSrc, "data-character-name": entity.canonicalName, "data-summary": entity.summary ?? "", className: "entity-image" } as const;

  const { openModal } = useModal();

  const openDetailsModal = () => {
    openModal(
      <div className="flex flex-row lg:flex-col gap-4 max-w-full lg:max-w-120 max-h-full">
        <div className="rounded-full overflow-hidden max-h-[90vh] max-w-[90vh] lg:max-h-120 lg:max-w-120 border-4 border-[var(--entity-highlight-border-light)]">
          <CharacterMedia mediaSrc={mediaSrc} commonAttrs={commonAttrs} isVideo={isVideo} canonicalName={entity.canonicalName} />
        </div>
        <div className="flex flex-col self-center p-4 rounded-lg bg-[var(--entity-highlight-bg-light)] border-2 border-[var(--entity-highlight-border-light)]">
          <h4 className="editable-text italic font-bold text-center">{entity.label || entity.canonicalName}</h4>
          <p className="text-center">{summaryHTML}</p>
        </div>
      </div>,
    );
  };

  const style = { "--stagger-delay": `${index * 0.13}s` } as React.CSSProperties;

  return (
    <div
      ref={cardRef}
      className="entity-note sidebar-item-animate"
      data-canonical-name={entity.canonicalName}
      data-appearances={JSON.stringify(apps)}
      style={style}
      onMouseEnter={() => requestToggle(true)}
      onMouseLeave={() => requestToggle(false)}
    >
      <div className="entity-image-column">
        <div className="entity-image-wrapper" onClick={openDetailsModal}>
          <CharacterMedia mediaSrc={mediaSrc} commonAttrs={commonAttrs} isVideo={isVideo} canonicalName={entity.canonicalName} />
        </div>
      </div>

      <div className="entity-text-column">
        <h4 className="editable-text">{entity.label || entity.canonicalName}</h4>
        <p dangerouslySetInnerHTML={{ __html: summaryHTML }} />
      </div>
    </div>
  );
};
