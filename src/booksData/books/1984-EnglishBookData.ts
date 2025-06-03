import { BookData } from "../types";
import { getBookThemeColors } from "../bookThemes";
import { BOOK_SLUGS } from "@/consts";
import { _1984EnglishCharactersData } from "@/data/metadata-1984-English";
import { _1984EnglishBookXml } from "@/data/chapters-1984-english";

export const bookData: BookData = {
  slug: BOOK_SLUGS._1984_English,
  metadata: { title: "1984-English" },
  charactersData: _1984EnglishCharactersData,
  chapters: 5,
  themeColors: getBookThemeColors(BOOK_SLUGS._1984_English),
  bookStringified: _1984EnglishBookXml,
  hasAudiobook: true,
};
