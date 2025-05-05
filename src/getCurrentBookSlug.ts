import { BOOK_SLUGS } from "./consts";
import { bookData } from "./rexportedBookData";

export const getCurrentBookSlug = (): BOOK_SLUGS => {
  return bookData.slug as BOOK_SLUGS;
};
