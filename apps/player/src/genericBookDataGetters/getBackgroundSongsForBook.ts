import type { BackgroundSongForBook } from "@player/types/book";
import { bookDataLoader } from "@player/services/bookDataLoader";

let cachedBackgroundSongs: BackgroundSongForBook[] | null = null;

export const getBackgroundSongsForBook = (): BackgroundSongForBook[] => {
  if (!cachedBackgroundSongs) {
    throw new Error("Background songs not loaded. Call loadBackgroundSongsForBook() first.");
  }
  return cachedBackgroundSongs;
};

export const loadBackgroundSongsForBook = async (): Promise<BackgroundSongForBook[]> => {
  if (!cachedBackgroundSongs) {
    // The bookDataLoader returns BackgroundSongSection[] which has the same shape as BackgroundSongForBook[]
    cachedBackgroundSongs = (await bookDataLoader.getBackgroundSongsForBook()) as BackgroundSongForBook[];
  }
  return cachedBackgroundSongs;
};

export const clearBackgroundSongsCache = () => {
  cachedBackgroundSongs = null;
};

// For live mode: directly inject background songs into cache
export const setBackgroundSongsCache = (value: BackgroundSongForBook[]) => {
  cachedBackgroundSongs = value;
};
