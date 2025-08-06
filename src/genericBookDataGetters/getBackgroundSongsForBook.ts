import type { BackgroundSongForBook } from "@/types/book";
import { bookDataLoader } from "@/services/bookDataLoader";

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
