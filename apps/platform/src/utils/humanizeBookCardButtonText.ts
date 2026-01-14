import type { Book } from "@platform/utils/types.ts";
import { detectLanguageFromDomain } from "@platform/utils/languageDetection.ts";

export const humanizeBookCardButtonText = (book: Book): string => {
  const language = detectLanguageFromDomain();

  return language === "pl"
    ? `Czytaj teraz`
    : `Experience ${book.type.charAt(0).toUpperCase() + book.type.slice(1).toLowerCase()}`;
};
