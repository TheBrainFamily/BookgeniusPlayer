import { getBookData } from "./getBookData";

// word, start
export type WordPosition = [string, number];

export type AudiobookTracksSection = { chapter: number; paragraph: number; file: string; smile_id: string; "clip-begin": number; "clip-end": number; words?: WordPosition[] };

export const getAudiobookTracksForBook = async (): Promise<AudiobookTracksSection[]> => {
  const bookData = getBookData();
  if (!bookData.hasAudiobook) {
    return [];
  }

  return [];
};
