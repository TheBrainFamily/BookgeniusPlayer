import type { Book } from "@platform/utils/types.ts";
import { detectLanguageFromDomain } from "@platform/utils/languageDetection.ts";

export const humanizeBookCardButtonText = (book: Book): string => {
  const language = detectLanguageFromDomain();

  return language === "pl" ? `Zanurz się w ${getPolishType(book.type)}` : `Experience ${book.type.charAt(0).toUpperCase() + book.type.slice(1).toLowerCase()}`;
};

const getPolishType = (type: string) => {
  switch (type.toLowerCase()) {
    case "powieść":
    case "novel":
      return "Powieści";
    case "sztuka":
    case "play":
      return "sztuce";
    default:
      return "powieści";
  }
};
