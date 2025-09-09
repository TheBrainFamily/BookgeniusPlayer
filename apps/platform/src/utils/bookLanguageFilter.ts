import type { Book } from "@platform/utils/types";
import { detectLanguageFromDomain } from "./languageDetection";

export const filterBooksByLanguage = (books: Book[]): Book[] => {
  const language = detectLanguageFromDomain();
  if (language === "pl") return books;
  return books.filter((book) => book.language === language);
};

export const getBooksByCurrentLanguage = (books: Book[]): Book[] => {
  return filterBooksByLanguage(books);
};
