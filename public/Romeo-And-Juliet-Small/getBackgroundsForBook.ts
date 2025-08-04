import type { BackgroundForBook } from "@/types/book";

export const getBackgroundsForBook = (): BackgroundForBook[] => [
  { chapter: 1, paragraph: 0, file: "openai-medium-1-1.mp4" },
  { chapter: 2, paragraph: 0, file: "openai-medium-2-0.mp4" },
];
