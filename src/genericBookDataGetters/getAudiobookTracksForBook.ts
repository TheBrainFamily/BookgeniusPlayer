import type { AudiobookTracksSection } from "@/types/book";
import { bookDataLoader } from "@/services/bookDataLoader";

let cachedTracks: AudiobookTracksSection[] | null = null;

export const getAudiobookTracksForBook = (): AudiobookTracksSection[] => {
  if (!cachedTracks) {
    throw new Error("Audiobook tracks not loaded. Call loadAudiobookTracksForBook() first.");
  }
  return cachedTracks;
};

export const loadAudiobookTracksForBook = async (): Promise<AudiobookTracksSection[]> => {
  if (!cachedTracks) {
    cachedTracks = await bookDataLoader.getAudiobookTracksForBook();
  }
  return cachedTracks;
};
