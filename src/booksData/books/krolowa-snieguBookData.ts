import { BookData } from "../types";
import { getBookThemeColors } from "../bookThemes";
import { BOOK_SLUGS } from "@/consts";
import { KrolowaSnieguCharactersData } from "@/data/metadata-Krolowa-Sniegu";

export const bookData: BookData = {
  slug: BOOK_SLUGS.Krolowa_Sniegu,
  metadata: { title: "Krolowa Sniegu" },
  charactersData: KrolowaSnieguCharactersData,
  chapters: 7,
  themeColors: getBookThemeColors(BOOK_SLUGS.Krolowa_Sniegu),
  hasAudiobook: true,
};
