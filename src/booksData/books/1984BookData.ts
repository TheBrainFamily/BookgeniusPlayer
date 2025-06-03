import { _1984CharactersData } from "@/data/metadata-1984";
import { BookData } from "../types";
import { getBookThemeColors } from "../bookThemes";
import { BOOK_SLUGS } from "@/consts";
import { _1984BookXml } from "@/data/chapters-1984";

export const bookData: BookData = {
  slug: BOOK_SLUGS._1984,
  metadata: { title: "1984" },
  charactersData: _1984CharactersData,
  chapters: 26,
  themeColors: getBookThemeColors(BOOK_SLUGS._1984),
  hasAudiobook: true,
  bookStringified: _1984BookXml,
  audioPrompt: `Answer question about this book. Use only knowledge from get_book_information tool. Absolutely no spoilers besides those chunks. Characters in the book: Willson, Big Brother, Julia, Parson. If I mispronounce a character's name, use this list to guide you. `,
};
