import { useEffect, useMemo, useState } from "react";
import { calculateReadProgress, calculateChapterProgress } from "@player/helpers/readProgress";
import { type ChapterStructure } from "@player/components/ProgressBars";
import { useLocation } from "@player/state/LocationContext";
import { useSavedLocation } from "./useSavedLocation";

export const useReadingProgress = (
  chaptersStructure: ChapterStructure[],
  totalParagraphs: number,
) => {
  const { savedLocation } = useSavedLocation();
  const { location } = useLocation();

  const { currentChapter, currentParagraph } = location;
  const savedChapter = savedLocation?.currentChapter;
  const savedParagraph = savedLocation?.currentParagraph;

  const [chapterProgress, setChapterProgress] = useState(0);
  const [interpolatedParagraph, setInterpolatedParagraph] = useState<number | null>(null);

  useEffect(() => {
    if (currentChapter === undefined || currentParagraph === undefined) {
      return;
    }

    let rafId: number | null = null;

    const updateProgressSnapshot = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const nextChapterProgress = calculateChapterProgress(currentChapter);
        setChapterProgress((prev) =>
          Math.abs(prev - nextChapterProgress) < 0.1 ? prev : nextChapterProgress,
        );

        let nextInterpolatedParagraph = currentParagraph;
        const indexedElement = document.querySelector<HTMLElement>(
          `section[data-chapter="${currentChapter}"] [data-index="${currentParagraph}"]`,
        );

        if (indexedElement) {
          const rect = indexedElement.getBoundingClientRect();
          if (rect.height > 0) {
            const readingLinePixelPosition = window.innerHeight * 0.4;
            const ratioWithinElement = (readingLinePixelPosition - rect.top) / rect.height;
            const clampedRatio = Math.max(0, Math.min(0.999, ratioWithinElement));
            nextInterpolatedParagraph = currentParagraph + clampedRatio;
          }
        }

        setInterpolatedParagraph((prev) =>
          prev === null || Math.abs(prev - nextInterpolatedParagraph) >= 0.001
            ? nextInterpolatedParagraph
            : prev,
        );
      });
    };

    updateProgressSnapshot();

    const contentContainer = document.getElementById("content-container");
    contentContainer?.addEventListener("scroll", updateProgressSnapshot, { passive: true });
    window.addEventListener("resize", updateProgressSnapshot);
    window.addEventListener("orientationchange", updateProgressSnapshot);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      contentContainer?.removeEventListener("scroll", updateProgressSnapshot);
      window.removeEventListener("resize", updateProgressSnapshot);
      window.removeEventListener("orientationchange", updateProgressSnapshot);
    };
  }, [currentChapter, currentParagraph]);

  const { bookProgress, furthestProgress } = useMemo(() => {
    if (
      chaptersStructure.length === 0 ||
      currentChapter === undefined ||
      currentParagraph === undefined
    ) {
      return { bookProgress: 0, furthestProgress: 0 };
    }

    const effectiveCurrentParagraph = interpolatedParagraph ?? currentParagraph;
    const bookProgress = calculateReadProgress(
      chaptersStructure,
      currentChapter,
      effectiveCurrentParagraph,
      totalParagraphs,
    );

    // Calculate the furthest progress (from saved location or current if no saved location)
    const furthestChapter = savedChapter ?? currentChapter;
    const furthestParagraph = savedParagraph ?? currentParagraph;
    const furthestProgress = calculateReadProgress(
      chaptersStructure,
      furthestChapter,
      furthestParagraph,
      totalParagraphs,
    );

    return { bookProgress, furthestProgress };
  }, [
    chaptersStructure,
    totalParagraphs,
    currentChapter,
    currentParagraph,
    interpolatedParagraph,
    savedChapter,
    savedParagraph,
  ]);

  return {
    chapterProgress: currentChapter === undefined ? 0 : chapterProgress,
    bookProgress,
    furthestProgress,
  };
};
