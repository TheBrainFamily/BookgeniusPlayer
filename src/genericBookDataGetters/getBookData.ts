import type { BookData } from "@/types/book";

export const getBookData = (): BookData => {
  throw new Error("getBookData should never be called at runtime");
};
