import { BOOK_SLUGS } from "@/consts";
import { AudiobookTracksDefined as _1984AudiobookTracksDefined } from "../public_books/1984/audiobook_data/1984AudiobookTracks";
import { AudiobookTracksDefined as KrolowaSnieguAudiobookTracksDefined } from "../public_books/Krolowa-Sniegu/audiobook_data/KrolowaSnieguAudiobookTracks";

export type AudiobookTracksSection = { chapter: number; paragraph: number; file: string; smile_id: string; "clip-begin": number; "clip-end": number };


export const getAudiobookTracksForBook = (bookSlug: string) => {
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
      return KrolowaSnieguAudiobookTracksDefined;
    // case BOOK_SLUGS.PHARAON:
    //   return pharaonBackgroundTracksDefined;
    // case BOOK_SLUGS.Conrad_Tajny_Agent:
    //   return conradTajnyAgentBackgroundTracksDefined;
    default:
      return [];
  }
};
