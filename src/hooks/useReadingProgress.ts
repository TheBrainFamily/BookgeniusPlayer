import { useMemo } from "react";
import { calculateReadProgress, calculateChapterProgress } from "@/helpers/readProgress";
import { ChapterStructure } from "@/components/ProgressBars";
import { useLocation } from "@/state/LocationContext";
import { useSavedLocation } from "./useSavedLocation";

export const useReadingProgress = (chaptersStructure: ChapterStructure[], totalParagraphs: number) => {
  const { savedLocation } = useSavedLocation();
  const { location } = useLocation();

  return useMemo(() => {
    if (chaptersStructure.length === 0 || !location) {
      return { chapterProgress: 0, bookProgress: 0, furthestProgress: 0 };
    }

    const currentChapter = location.currentChapter || 1;
    const currentParagraph = location.currentParagraph || 0;

    // Calculate current progress
    const chapterProgress = calculateChapterProgress(currentChapter);
    const bookProgress = calculateReadProgress(chaptersStructure, currentChapter, currentParagraph, totalParagraphs);

    // Calculate the furthest progress (from saved location or current if no saved location)
    const furthestChapter = savedLocation?.currentChapter ?? currentChapter;
    const furthestParagraph = savedLocation?.currentParagraph ?? currentParagraph;
    const furthestProgress = calculateReadProgress(chaptersStructure, furthestChapter, furthestParagraph, totalParagraphs);

    return { chapterProgress, bookProgress, furthestProgress };
  }, [chaptersStructure, totalParagraphs, location, savedLocation]);
};
