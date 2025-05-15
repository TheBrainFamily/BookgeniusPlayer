import { PharaonCharactersData } from "@/data/metadata-Pharaon";
import { PharaonBookXml } from "@/data/chapters-pharaon";
import { BookData } from "../types";
import { getBookThemeColors } from "../bookThemes";
import { BOOK_SLUGS } from "@/consts";

export const bookData: BookData = {
  slug: BOOK_SLUGS.PHARAON,
  metadata: { title: "Pharaon" },
  charactersData: PharaonCharactersData,
  bookXml: PharaonBookXml,
  chapters: 100,
  themeColors: getBookThemeColors(BOOK_SLUGS.PHARAON),
};
