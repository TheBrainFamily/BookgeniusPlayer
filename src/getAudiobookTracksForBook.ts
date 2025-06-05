import { BOOK_SLUGS } from "@/consts";
import { getBookData } from "./genericBookDataGetters/getBookData";

// word, start
export type WordPosition = [string, number];

export type AudiobookTracksSection = { chapter: number; paragraph: number; file: string; smile_id: string; "clip-begin": number; "clip-end": number; words?: WordPosition[] };

export const getAudiobookTracksForBook = async (): Promise<AudiobookTracksSection[]> => {
  const bookData = getBookData();
  if (!bookData.hasAudiobook) {
    return [];
  }
  // const audiobookTracks = await getAudiobookData();
  // const bookSlug = bookData.slug;
  // switch (bookSlug) {
  //   case BOOK_SLUGS._1984:
  //     return audiobookTracks.map((track) => {
  //       if (track.chapter === 1) {
  //         return { ...track, paragraph: track.paragraph - 6 };
  //       } else {
  //         return track;
  //       }
  //     });
  //   case BOOK_SLUGS.Krolowa_Sniegu:
  //     return audiobookTracks;
  //   case BOOK_SLUGS.Conrad_Tajny_Agent:
  //     return audiobookTracks;
  //   case BOOK_SLUGS._1984_English:
  //     return audiobookTracks;
  //   default:
  //     return [];
  // }
};
