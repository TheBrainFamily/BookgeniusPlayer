import { ConradTajnyAgentCharactersData } from "@/data/metadata-Conrad-Tajny-Agent";
import { ConradTajnyAgentBookXml } from "@/data/chapters-Conrad-Tajny-Agent";
import { BookData } from "../types";
import { BOOK_SLUGS } from "@/consts";
import { getBookThemeColors } from "../bookThemes";

export const bookData: BookData = {
  slug: BOOK_SLUGS.Conrad_Tajny_Agent,
  metadata: { title: "Conrad Tajny Agent" },
  charactersData: ConradTajnyAgentCharactersData,
  bookXml: ConradTajnyAgentBookXml,
  chapters: 13,
  themeColors: getBookThemeColors(BOOK_SLUGS.Conrad_Tajny_Agent),
};
