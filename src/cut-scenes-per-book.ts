import { BOOK_SLUGS } from "./consts";
import { CURRENT_BOOK } from "./consts";

export type CutScene = { chapter: number; paragraph: number; file: string; text: string; delayInMs?: number };
export const getCutScenes = (): CutScene[] => {
  switch (CURRENT_BOOK) {
    case BOOK_SLUGS.Conrad_Tajny_Agent:
      return [];
    case BOOK_SLUGS.Krolowa_Sniegu:
      console.log("returning cut scene for krolowa sniegu");
      return [{ chapter: 1, paragraph: 6, file: "mirror-crashing.mp4", text: "", delayInMs: 15000 }];
    case BOOK_SLUGS.PHARAON:
      return [{ chapter: 3, paragraph: 31, file: "ramzes-sara-cutscene.mp4", text: "Sara uspokoiła się powoli, a jej aksamitne oczy przybrały wyraz łagodnego smutku..." }];
    case BOOK_SLUGS._1984:
      return [];
    default:
      return [];
  }
};
