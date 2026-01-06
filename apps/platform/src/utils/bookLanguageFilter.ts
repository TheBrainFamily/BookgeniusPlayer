import type { Book } from "@platform/utils/types";
import { detectLanguageFromDomain, SupportedLanguage } from "./languageDetection";
import { books, books as currentBooks } from "@platform/books.ts";

const EXCLUDED_BOOKS_BY_LANGUAGE: Record<SupportedLanguage, string[]> = {
  pl: ["Snow-Queen"],
  en: [],
} as const;

const filterExcludedBooks = (language: SupportedLanguage, books: Book[]): Book[] => {
  const excludedSlugs = EXCLUDED_BOOKS_BY_LANGUAGE[language] || [];
  return books.filter((book) => !excludedSlugs.includes(book.slug));
};

export const filterBooksByLanguage = (books: Book[]): Book[] => {
  const language = detectLanguageFromDomain();

  const booksWithoutExcluded = filterExcludedBooks(language, books);

  if (language === "pl") {
    return booksWithoutExcluded;
  }

  return booksWithoutExcluded.filter((book) => book.language === language);
};

export const getBooksByCurrentLanguage = (books: Book[] = currentBooks): Book[] => {
  return filterBooksByLanguage(books);
};

export const featuredBooks = () => {
  const language = detectLanguageFromDomain();
  const featuredBookSlugs = language === "pl" ? ["1984", "Othello"] : ["1984-English", "Othello"];
  return books
    .filter((book) => featuredBookSlugs.includes(book.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));
};
