import { BOOK_SLUGS } from "@/consts";
import { BookThemeColors } from "@/booksData/types";

const DEFAULT_BOOK_THEME_COLORS: BookThemeColors = { primaryColor: "#E5E7EB", secondaryColor: "#4B5563", tertiaryColor: "#9CA3AF", quaternaryColor: "#1F2937" };

export const DEFAULT_BOOK_THEMES: Partial<Record<BOOK_SLUGS, BookThemeColors>> = {
  [BOOK_SLUGS._1984]: { primaryColor: "#D32F2F", secondaryColor: "#212121", tertiaryColor: "#757575", quaternaryColor: "#000000" },
  [BOOK_SLUGS.PHARAON]: { primaryColor: "#D4AF37", secondaryColor: "#8C6239", tertiaryColor: "#F2E394", quaternaryColor: "#C2B280" },
  [BOOK_SLUGS.Conrad_Tajny_Agent]: { primaryColor: "#2C3E50", secondaryColor: "#34495E", tertiaryColor: "#7F8C8D", quaternaryColor: "#1A252F" },
  [BOOK_SLUGS.Krolowa_Sniegu]: { primaryColor: "#E3F2FD", secondaryColor: "#1976D2", tertiaryColor: "#90CAF9", quaternaryColor: "#0D47A1" },
};

/**
 * Get theme colors for a specific book
 * @param bookSlug The book slug
 * @returns Theme colors for the specified book
 */
export const getBookThemeColors = (bookSlug: BOOK_SLUGS): BookThemeColors => {
  return DEFAULT_BOOK_THEMES[bookSlug] || DEFAULT_BOOK_THEME_COLORS;
};
