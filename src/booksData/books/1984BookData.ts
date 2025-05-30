import { _1984CharactersData } from "@/data/metadata-1984";
import { BookData } from "../types";
import { getBookThemeColors } from "../bookThemes";
import { BOOK_SLUGS } from "@/consts";

export const bookData: BookData = {
  slug: BOOK_SLUGS._1984,
  metadata: { title: "1984" },
  charactersData: _1984CharactersData,
  chapters: 26,
  themeColors: getBookThemeColors(BOOK_SLUGS._1984),
  hasAudiobook: true,
};
