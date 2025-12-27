import { getBookData } from "../shared-books-data/getBooksData";
import { getChaptersUpToWithChapters } from "./getChaptersUpToWithChapters";

export const getChaptersUpTo = (from: number, upTo: number) => {
  return getChaptersUpToWithChapters(from, upTo, getBookData().chapters);
};
