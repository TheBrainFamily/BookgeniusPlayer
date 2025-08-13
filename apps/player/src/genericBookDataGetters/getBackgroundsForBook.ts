import type { BackgroundForBook } from "@/types/book";
import { bookDataLoader } from "@/services/bookDataLoader";

let cachedBackgrounds: BackgroundForBook[] | null = null;

export const getBackgroundsForBook = (): BackgroundForBook[] => {
  if (!cachedBackgrounds) {
    throw new Error("Backgrounds not loaded. Call loadBackgroundsForBook() first.");
  }
  return cachedBackgrounds;
};

export const loadBackgroundsForBook = async (): Promise<BackgroundForBook[]> => {
  if (!cachedBackgrounds) {
    cachedBackgrounds = await bookDataLoader.getBackgroundsForBook();
  }
  return cachedBackgrounds;
};
