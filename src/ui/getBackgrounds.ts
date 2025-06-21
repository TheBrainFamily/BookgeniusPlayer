import type { BackgroundForBook } from "@/types/book";
import type { Background } from "./background";
import { getBackgroundsForBook } from "@/genericBookDataGetters/getBackgroundsForBook";

export const getBackgrounds = (): Background[] => {
  // Helper function to process background inputs and set proper end paragraphs
  const processBackgroundInputs = (inputs: BackgroundForBook[]): Background[] => {
    // Group by chapter
    const chapterGroups: Record<number, { chapter: number; file: string; startParagraph: number }[]> = {};

    // First, normalize and group by chapter
    inputs.forEach(({ chapter, file, paragraph = 0 }) => {
      if (!chapterGroups[chapter]) {
        chapterGroups[chapter] = [];
      }
      chapterGroups[chapter].push({ chapter, file, startParagraph: paragraph });
    });

    // Process each chapter group
    const result: Background[] = [];
    Object.values(chapterGroups).forEach((backgrounds) => {
      // Sort by startParagraph
      backgrounds.sort((a, b) => a.startParagraph - b.startParagraph);

      // Set endParagraph for each background
      backgrounds.forEach((bg, index) => {
        const nextBg = backgrounds[index + 1];
        const endParagraph = nextBg ? nextBg.startParagraph - 1 : 10_000; // 10,000 for the last bg in chapter

        result.push({ startChapter: bg.chapter, startParagraph: bg.startParagraph, file: bg.file, endChapter: bg.chapter, endParagraph });
      });
    });

    return result;
  };

  return processBackgroundInputs(getBackgroundsForBook());
};
