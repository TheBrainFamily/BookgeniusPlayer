import { BookData } from "./types";
import { CURRENT_BOOK, BOOK_SLUGS } from "../consts";

import { bookData as _1984BookData } from "./books/1984BookData";
import { bookData as pharaonBookData } from "./books/pharaonBookData";

let cache: BookData | null = null;

export async function getBookData(): Promise<BookData> {
  if (cache) {
    return cache;
  }

  switch (CURRENT_BOOK) {
    case BOOK_SLUGS._1984:
      cache = _1984BookData;
      break;
    case BOOK_SLUGS.PHARAON:
      cache = pharaonBookData;
      break;
    default:
      throw new Error(`No book data found for "${CURRENT_BOOK}"`);
  }

  return cache;
}
