import { ChapterStructure } from "@/components/ProgressBars";

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
 * Calculate chapter progress as a percentage
 */
export const calculateChapterProgress = (chaptersStructure: ChapterStructure[], currentChapter: number, currentParagraph: number): number => {
  const chapterData = chaptersStructure.find((ch) => ch.chapterNumber === currentChapter);
  if (!chapterData) return 0;

  return Math.min(((currentParagraph + 1) / chapterData.paragraphCount) * 100, 100);
};
