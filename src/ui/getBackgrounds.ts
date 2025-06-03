import { BOOK_SLUGS, CURRENT_BOOK } from "@/consts";
import type { Background } from "./background";

export const getBackgrounds = (): Background[] => {
  // Helper function to process background inputs and set proper end paragraphs
  const processBackgroundInputs = (inputs: { chapter: number; file: string; startParagraph?: number }[]): Background[] => {
    // Group by chapter
    const chapterGroups: Record<number, { chapter: number; file: string; startParagraph: number }[]> = {};

    // First, normalize and group by chapter
    inputs.forEach(({ chapter, file, startParagraph = 0 }) => {
      if (!chapterGroups[chapter]) {
        chapterGroups[chapter] = [];
      }
      chapterGroups[chapter].push({ chapter, file, startParagraph });
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

  const backgroundsInput = [
    { chapter: 1, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 2, file: "background-wawoz-fade.mp4" },
    { chapter: 3, file: "background-sara-slow-motion-loop.mp4" },
    { chapter: 4, file: "background-army-fade-loop.mp4" },
    { chapter: 5, file: "background-sara-estate-fade.mp4" },
    { chapter: 6, file: "chapter6-slow-fade-sw-q20.mp4" },
    { chapter: 7, file: "chapter7-slow-fade-sw-q20.mp4" },
    { chapter: 8, file: "background-moving-generic-estate-fade.mp4" },
    { chapter: 9, file: "chapter9-slow-fade-sw-q20.mp4" },
    { chapter: 10, file: "chapter10-slow-fade-sw-q20.mp4" },
    { chapter: 11, file: "chapter11-slow-fade-sw-q20.mp4" },
    { chapter: 12, file: "chapter12-slow-fade-sw-q20.mp4" },
    { chapter: 13, file: "background-moving-generic-estate-fade.mp4" },
    { chapter: 14, file: "background-moving-generic-estate-fade.mp4" },
    { chapter: 15, file: "background-moving-generic-estate-slow-motion-loop.mp4" },
    { chapter: 16, file: "background-generic-pingpong-fade.mp4" },
    { chapter: 17, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 18, file: "background-generic-pingpong-fade.mp4" },
    { chapter: 19, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 20, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 21, file: "background-generic-pingpong-fade.mp4" },
    { chapter: 22, file: "background-generic-pingpong-fade.mp4" },
    { chapter: 23, file: "background-moving-generic-estate-fade.mp4" },
    { chapter: 24, file: "background-moving-generic-estate-fade.mp4" },
    { chapter: 25, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 26, file: "chapter26-slow-fade-sw-q20.mp4" },
    { chapter: 27, file: "chapter27-slow-fade-sw-q20.mp4" },
    { chapter: 28, file: "chapter28-slow-fade-sw-q20.mp4" },
    { chapter: 29, file: "chapter29-slow-fade-sw-q20.mp4" },
    { chapter: 30, file: "chapter30-slow-fade-sw-q20.mp4" },
    { chapter: 31, file: "chapter31-slow-fade-sw-q20.mp4" },
    { chapter: 32, file: "chapter32-slow-fade-sw-q20.mp4" },
    { chapter: 33, file: "chapter33-slow-fade-sw-q20.mp4" },
    { chapter: 34, file: "chapter34-slow-fade-sw-q20.mp4" },
    { chapter: 35, file: "chapter35-slow-fade-sw-q20.mp4" },
    { chapter: 36, file: "chapter36-slow-fade-sw-q20.mp4" },
    { chapter: 37, file: "chapter37-slow-fade-sw-q20.mp4" },
    { chapter: 38, file: "chapter38-slow-fade-sw-q20.mp4" },
    { chapter: 39, file: "chapter39-slow-fade-sw-q20.mp4" },
    { chapter: 40, file: "chapter40-slow-fade-sw-q20.mp4" },
    { chapter: 41, file: "chapter41-slow-fade-sw-q20.mp4" },
    { chapter: 42, file: "chapter42-slow-fade-sw-q20.mp4" },
    { chapter: 43, file: "chapter43-slow-fade-sw-q20.mp4" },
    { chapter: 44, file: "chapter44-slow-fade-sw-q20.mp4" },
    { chapter: 45, file: "chapter45-slow-fade-sw-q20.mp4" },
    { chapter: 46, file: "chapter46-slow-fade-sw-q20.mp4" },
    { chapter: 47, file: "chapter47-slow-fade-sw-q20.mp4" },
    { chapter: 48, file: "chapter48-slow-fade-sw-q20.mp4" },
    { chapter: 49, file: "chapter49-slow-fade-sw-q20.mp4" },
    { chapter: 50, file: "chapter_50.mp4" },
    { chapter: 51, file: "chapter_51.mp4" },
    { chapter: 52, file: "chapter_52.mp4" },
    { chapter: 53, file: "chapter_53.mp4" },
    { chapter: 54, file: "chapter_54.mp4" },
    { chapter: 55, file: "chapter_55.mp4" },
    { chapter: 56, file: "chapter_56.mp4" },
    { chapter: 57, file: "chapter_57.mp4" },
    { chapter: 58, file: "chapter_58.mp4" },
    { chapter: 59, file: "chapter_59.mp4" },
    { chapter: 60, file: "chapter_60.mp4" },
    { chapter: 61, file: "chapter_61.mp4" },
    { chapter: 62, file: "chapter_62.mp4" },
    { chapter: 63, file: "chapter_63.mp4" },
    { chapter: 64, file: "chapter_64.mp4" },
    { chapter: 65, file: "chapter_65.mp4" },
    { chapter: 66, file: "chapter_66.mp4" },
    { chapter: 67, file: "chapter_67.mp4" },
  ];
  let backgrounds = processBackgroundInputs(backgroundsInput);

  if (CURRENT_BOOK === BOOK_SLUGS._1984 || CURRENT_BOOK === BOOK_SLUGS._1984_English) {
    const backgroundsInput = [
      { chapter: 1, startParagraph: 0, file: "chapter_1.mp4" },
      { chapter: 1, startParagraph: 22, file: "chapter_23.mp4" },
      { chapter: 2, startParagraph: 0, file: "chapter_2.mp4" },
      { chapter: 2, startParagraph: 26, file: "chapter_24.mp4" },
      { chapter: 3, startParagraph: 0, file: "chapter_3.mp4" },
      { chapter: 4, startParagraph: 0, file: "chapter_4.mp4" },
      { chapter: 4, startParagraph: 13, file: "chapter_8.mp4" },
      { chapter: 5, startParagraph: 0, file: "chapter_5.mp4" },
      { chapter: 5, startParagraph: 36, file: "chapter_4.mp4" },
      { chapter: 6, startParagraph: 0, file: "chapter_6.mp4.mp4" },
      { chapter: 6, startParagraph: 10, file: "1984-chapter-6-2.mp4" },
      { chapter: 7, startParagraph: 0, file: "chapter_7.mp4" },
      { chapter: 8, file: "chapter_8.mp4" },
      { chapter: 9, file: "chapter_9.mp4" },
      { chapter: 10, file: "chapter_10.mp4" },
      { chapter: 11, file: "chapter_11.mp4" },
      { chapter: 12, file: "chapter_12.mp4" },
      { chapter: 13, file: "chapter_13.mp4" },
      { chapter: 14, file: "chapter_14.mp4" },
      { chapter: 15, file: "chapter_15.mp4" },
      { chapter: 16, file: "chapter_16.mp4" },
      { chapter: 17, file: "chapter_17.mp4" },
      { chapter: 18, file: "chapter_18.mp4" },
      { chapter: 19, file: "chapter_19.mp4" },
      { chapter: 20, file: "chapter_20.mp4" },
      { chapter: 21, file: "chapter_21.mp4" },
      { chapter: 22, file: "chapter_22.mp4" },
      { chapter: 23, file: "chapter_23.mp4" },
      { chapter: 24, file: "chapter_24.mp4" },
    ];
    backgrounds = processBackgroundInputs(backgroundsInput);
  }

  if (CURRENT_BOOK === BOOK_SLUGS.Conrad_Tajny_Agent) {
    const backgroundsInput = [
      { chapter: 1, file: "chapter-1.mp4" },
      { chapter: 2, file: "chapter-2.mp4" },
      { chapter: 3, file: "chapter-3.mp4" },
      { chapter: 4, file: "chapter-4.mp4" },
      { chapter: 5, file: "chapter-5.mp4" },
      { chapter: 6, file: "chapter-6.mp4" },
      { chapter: 7, file: "chapter-7.mp4" },
      { chapter: 8, file: "chapter-8.mp4" },
      { chapter: 9, file: "chapter-9.mp4" },
      { chapter: 10, file: "chapter-10.mp4" },
      { chapter: 11, file: "chapter-11.mp4" },
      { chapter: 12, file: "chapter-12.mp4" },
      { chapter: 13, file: "chapter-13.mp4" },
    ];
    backgrounds = processBackgroundInputs(backgroundsInput);
  }

  if (CURRENT_BOOK === BOOK_SLUGS.Krolowa_Sniegu) {
    const backgroundsInput = [
      { chapter: 1, startParagraph: 0, file: "chapter-1-background.mp4" },
      { chapter: 2, startParagraph: 0, file: "krolowa-chapter-2-paragraph-0-loop.mp4" },
      { chapter: 2, startParagraph: 35, file: "krolowa-chapter-2-paragraph-35.mp4" },
      { chapter: 2, startParagraph: 42, file: "snow-covered-forest.mp4" },
      { chapter: 3, startParagraph: 0, file: "riverbank.mp4" },
      { chapter: 3, startParagraph: 20, file: "cottage-with-flower-covered-walls.mp4" },
      { chapter: 3, startParagraph: 43, file: "krolowa-chapter-3-paragraph-43.mp4" },
      { chapter: 4, startParagraph: 0, file: "forest-first-snow.mp4" },
      { chapter: 4, startParagraph: 22, file: "palace-interior.mp4" },
      { chapter: 4, startParagraph: 39, file: "gerda-w-palacu-fixed.mp4" },
      { chapter: 5, startParagraph: 0, file: "forest-at-night.mp4" },
      { chapter: 5, startParagraph: 11, file: "chapter-5-zamek-zbojow.mp4" },
      { chapter: 5, startParagraph: 36, file: "forest-at-night.mp4" },
      { chapter: 5, startParagraph: 40, file: "frozen-plain.mp4" },
      { chapter: 6, startParagraph: 0, file: "dom-laponki.mp4" },
      { chapter: 6, startParagraph: 6, file: "finland-cottage.mp4" },
      { chapter: 6, startParagraph: 23, file: "krolowa-chapter-6-23.mp4" },
      { chapter: 6, startParagraph: 28, file: "ice-castle-exterior.mp4" },
      { chapter: 7, startParagraph: 0, file: "ice-castle-interior.mp4" },
      { chapter: 7, startParagraph: 4, file: "krolowa-chapter-7-4.mp4" },
      { chapter: 7, startParagraph: 27, file: "summer-garden.mp4" },
      { chapter: 7, startParagraph: 40, file: "krolowa-town-loop2.mp4" },
      { chapter: 7, startParagraph: 43, file: "grandmother-house.mp4" },
    ];
    backgrounds = processBackgroundInputs(backgroundsInput);
  }

  return backgrounds;
};
