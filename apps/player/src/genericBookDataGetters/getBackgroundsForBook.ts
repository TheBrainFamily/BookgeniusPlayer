import type { BackgroundForBook } from "@player/types/book";
import { bookDataLoader } from "@player/services/bookDataLoader";

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

export const clearBackgroundsCache = () => {
  cachedBackgrounds = null;
};
