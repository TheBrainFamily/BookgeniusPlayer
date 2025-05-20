import { BOOK_SLUGS } from "@/consts";
import { AudiobookTracksDefined as _1984AudiobookTracksDefined } from "./booksData/1984AudiobookTracks";
import { AudiobookTracksDefined as KrolowaSnieguAudiobookTracksDefined } from "./booksData/KrolowaSnieguAudiobookTracks";
import { AudiobookTracksDefined as ConradTajnyAgentAudiobookTracksDefined } from "./booksData/ConradTajnyAgentAudiobookTracks";

// word, start
export type WordPosition = [string, number];

export type AudiobookTracksSection = { chapter: number; paragraph: number; file: string; smile_id: string; "clip-begin": number; "clip-end": number; words?: WordPosition[] };

export const getAudiobookTracksForBook = (bookSlug: string): AudiobookTracksSection[] => {
  switch (bookSlug) {
    case BOOK_SLUGS._1984:
      return _1984AudiobookTracksDefined.map((track) => {
        if (track.chapter === 1) {
          return { ...track, paragraph: track.paragraph - 6 };
        } else {
          return track;
        }
      });
    case BOOK_SLUGS.Krolowa_Sniegu:
      return KrolowaSnieguAudiobookTracksDefined as AudiobookTracksSection[];
    case BOOK_SLUGS.Conrad_Tajny_Agent:
      return ConradTajnyAgentAudiobookTracksDefined as AudiobookTracksSection[];
    // case BOOK_SLUGS.PHARAON:
    //   return pharaonBackgroundTracksDefined;
    // case BOOK_SLUGS.Conrad_Tajny_Agent:
    //   return conradTajnyAgentBackgroundTracksDefined;
    default:
      return [];
  }
};
