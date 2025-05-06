import { BOOK_SLUGS, CURRENT_BOOK } from "../consts";
import { bookData as _1984BookData } from "./books/1984BookData";
import { bookData as pharaonBookData } from "./books/pharaonBookData";

const getCurrentBookData = () => {
  switch (CURRENT_BOOK) {
    case BOOK_SLUGS.PHARAON:
      return pharaonBookData;
    case BOOK_SLUGS._1984:
      return _1984BookData;
    default:
      throw new Error("Book not supported for replacement");
  }
};

export const bookData = getCurrentBookData();
