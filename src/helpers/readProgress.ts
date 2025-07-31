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

// /**
//  * Calculate chapter progress as a percentage
//  */
// export const calculateChapterProgress = (chaptersStructure: ChapterStructure[], currentChapter: number, currentParagraph: number): number => {
//   const chapterData = chaptersStructure.find((ch) => ch.chapterNumber === currentChapter);
//   if (!chapterData) return 0;
//
//   return Math.min(((currentParagraph + 1) / chapterData.paragraphCount) * 100, 100);
// };

/**
 * Calculate chapter progress as a percentage based on user scroll position
 */
export const calculateChapterProgress = (currentChapter: number): number => {
  const activeChapter = document.querySelector(`section[data-chapter="${currentChapter}"]`) as HTMLElement | null;

  if (!activeChapter) {
    return 0;
  }

  const viewportHeight = window.innerHeight;
  // Focus zone middle (middle reading line) is at 60vh from the top of the container (35vh+(75vh-35vh/2))
  // const readingLine = viewportHeight * 0.6;

  // Focus zone top (first reading line) is at 35vh from the top of the container
  // const readingLine = viewportHeight * 0.35;

  // Focus zone bottom (lasr reading line) is at 75vh from the top of the container
  const readingLine = viewportHeight * 0.75;

  const rect = activeChapter.getBoundingClientRect();

  const scrollDistance = readingLine - rect.top;

  // Avoid division by zero if the element has no height, which can result in NaN.
  if (rect.height <= 0) {
    return scrollDistance > 0 ? 100 : 0;
  }

  const progress = (scrollDistance / rect.height) * 100;
  console.log("PINGWING: 60 in calculateChapterProgressprogress", progress);

  return Math.max(0, Math.min(100, progress));
};
