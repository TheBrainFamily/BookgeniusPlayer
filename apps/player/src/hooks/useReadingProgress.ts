import { useMemo } from "react";
import { calculateReadProgress, calculateChapterProgress } from "@player/helpers/readProgress";
import { ChapterStructure } from "@player/components/ProgressBars";
import { useLocation } from "@player/state/LocationContext";
import { useSavedLocation } from "./useSavedLocation";

export const useReadingProgress = (chaptersStructure: ChapterStructure[], totalParagraphs: number) => {
  const { savedLocation } = useSavedLocation();
  const { location } = useLocation();

  const { currentChapter, currentParagraph } = location;
  const { currentChapter: savedChapter, currentParagraph: savedParagraph } = savedLocation;
  return useMemo(() => {
    if (chaptersStructure.length === 0 || currentChapter === undefined || currentParagraph === undefined) {
      return { chapterProgress: 0, bookProgress: 0, furthestProgress: 0 };
    }

    // Calculate current progress
    const chapterProgress = calculateChapterProgress(currentChapter);
    const bookProgress = calculateReadProgress(chaptersStructure, currentChapter, currentParagraph, totalParagraphs);

    // Calculate the furthest progress (from saved location or current if no saved location)
    const furthestChapter = savedChapter ?? currentChapter;
    const furthestParagraph = savedParagraph ?? currentParagraph;
    const furthestProgress = calculateReadProgress(chaptersStructure, furthestChapter, furthestParagraph, totalParagraphs);

    return { chapterProgress, bookProgress, furthestProgress };
  }, [chaptersStructure, totalParagraphs, currentChapter, currentParagraph, savedChapter, savedParagraph]);
};
