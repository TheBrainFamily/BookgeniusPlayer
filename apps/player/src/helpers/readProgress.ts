import { ChapterStructure } from "@player/components/ProgressBars";

/**
 * Unified function to calculate reading progress for any given chapter/paragraph position
 */
export const calculateReadProgress = (chaptersStructure: ChapterStructure[], targetChapter: number, targetParagraph: number, totalParagraphs: number): number => {
  if (totalParagraphs === 0 || chaptersStructure.length === 0) {
    return 0;
  }

  let readParagraphs = 0;

  for (const chapter of chaptersStructure) {
    if (chapter.chapterNumber < targetChapter) {
      readParagraphs += chapter.paragraphCount;
    } else if (chapter.chapterNumber === targetChapter) {
      readParagraphs += Math.min(targetParagraph + 1, chapter.paragraphCount);
      break;
    }
  }

  return (readParagraphs / totalParagraphs) * 100;
};

/**
 * Calculate chapter progress as a percentage based on user scroll position
 */
export const calculateChapterProgress = (currentChapter: number): number => {
  const activeChapter = document.querySelector(`section[data-chapter="${currentChapter}"]`) as HTMLElement | null;
  if (!activeChapter) {
    return 0;
  }

  const viewportHeight = window.innerHeight;
  const readingLinePercentage = 0.4;
  const readingLinePixelPosition = viewportHeight * readingLinePercentage;

  const rect = activeChapter.getBoundingClientRect();

  const scrollDistance = readingLinePixelPosition - rect.top;

  // Avoid division by zero if the element has no height, which can result in NaN.
  if (rect.height <= 0) {
    return scrollDistance > 0 ? 100 : 0;
  }

  const progress = (scrollDistance / rect.height) * 100;

  return Math.max(0, Math.min(100, progress));
};
