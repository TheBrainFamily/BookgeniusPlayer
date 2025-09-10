import type { Book } from "@platform/utils/types";
import { detectLanguageFromDomain } from "./languageDetection";
import { books as currentBooks } from "@platform/books.ts";

export const filterBooksByLanguage = (books: Book[]): Book[] => {
  const language = detectLanguageFromDomain();
  if (language === "pl") return books;
  return books.filter((book) => book.language === language);
};

export const getBooksByCurrentLanguage = (books: Book[] = currentBooks): Book[] => {
  return filterBooksByLanguage(books);
};
