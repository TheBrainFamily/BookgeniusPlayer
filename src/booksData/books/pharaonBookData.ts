import { PharaonCharactersData } from "@/data/metadata-Pharaon";
import { BookData } from "../types";
import { getBookThemeColors } from "../bookThemes";
import { BOOK_SLUGS } from "@/consts";

export const bookData: BookData = {
  slug: BOOK_SLUGS.PHARAON,
  metadata: { title: "Pharaon" },
  charactersData: PharaonCharactersData,
  chapters: 68,
  themeColors: getBookThemeColors(BOOK_SLUGS.PHARAON),
  hasAudiobook: false,
};
