import type { BackgroundSongSection } from "@/getBackgroundSongsForBook";

export const getBackgroundSongsForBook = (): BackgroundSongSection[] => {
  return [
    { chapter: 1, paragraph: 0, files: ["chapter_1_paragraph_1.mp3", "chapter_1_paragraph_1b.mp3"] },
    { chapter: 2, paragraph: 0, files: ["chapter_2_paragraph_1.mp3", "chapter_2_paragraph_1b.mp3"] },
    { chapter: 2, paragraph: 24, files: ["chapter_2_paragraph_24.mp3", "chapter_2_paragraph_24b.mp3"] },
    { chapter: 3, paragraph: 1, files: ["chapter_3_paragraph_1.mp3", "chapter_3_paragraph_1b.mp3"] },
    { chapter: 3, paragraph: 20, files: ["chapter_3_paragraph_20b.mp3", "chapter_3_paragraph_20.mp3"] },
    { chapter: 3, paragraph: 37, files: ["chapter_3_paragraph_37.mp3", "chapter_3_paragraph_37b.mp3"] },
    { chapter: 4, paragraph: 1, files: ["chapter_4_paragraph_1.mp3", "chapter_4_paragraph_1b.mp3"] },
    { chapter: 4, paragraph: 35, files: ["chapter_4_paragraph_35.mp3", "chapter_4_paragraph_35b.mp3"] },
    { chapter: 5, paragraph: 1, files: ["chapter_5_paragraph_1.mp3", "chapter_5_paragraph_1b.mp3"] },
    { chapter: 5, paragraph: 23, files: ["chapter_5_paragraph_23.mp3", "chapter_5_paragraph_23b.mp3"] },
    { chapter: 6, paragraph: 1, files: ["chapter_6_paragraph_1.mp3", "chapter_6_paragraph_1b.mp3"] },
    { chapter: 6, paragraph: 28, files: ["chapter_6_paragraph_28.mp3", "chapter_6_paragraph_28b.mp3"] },
    { chapter: 6, paragraph: 31, files: ["chapter_6_paragraph_31.mp3", "chapter_6_paragraph_31b.mp3"] },
    { chapter: 7, paragraph: 1, files: ["chapter_7_paragraph_1.mp3", "chapter_7_paragraph_1b.mp3"] },
    { chapter: 7, paragraph: 25, files: ["chapter_7_paragraph_25.mp3", "chapter_7_paragraph_25b.mp3"] },
  ];
};
