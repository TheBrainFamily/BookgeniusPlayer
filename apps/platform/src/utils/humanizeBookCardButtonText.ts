import type { Book } from "@platform/utils/types.ts";

export const humanizeBookCardButtonText = (book: Book): string => {
  const experience = book.language === "pl" ? `Zanurz się w ${getPolishType(book.type)}` : `Experience ${book.type}`;

  return experience
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const getPolishType = (type: string) => {
  switch (type.toLowerCase()) {
    case "powieść":
      return "powieści";
    case "sztuka":
      return "sztuce";
    default:
      return "powieści";
  }
};
