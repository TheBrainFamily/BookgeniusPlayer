import type { Book } from "@platform/utils/types.ts";

export const humanizeBookCardButtonText = (book: Book): string => {
  return book.language === "pl" ? `Zanurz się w ${getPolishType(book.type)}` : `Experience ${book.type.charAt(0).toUpperCase() + book.type.slice(1).toLowerCase()}`;
};

const getPolishType = (type: string) => {
  switch (type.toLowerCase()) {
    case "powieść":
      return "Powieści";
    case "sztuka":
      return "Sztuce";
    default:
      return "Powieści";
  }
};
