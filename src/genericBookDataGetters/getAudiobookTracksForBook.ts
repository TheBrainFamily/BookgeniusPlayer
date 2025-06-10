export type WordPosition = [string, number]; // word, start

export type AudiobookTracksSection = { chapter: number; paragraph: number; file: string; smile_id?: string; "clip-begin": number; "clip-end": number; words?: WordPosition[] };

export const getAudiobookTracksForBook = (): AudiobookTracksSection[] => {
  return [];
};
