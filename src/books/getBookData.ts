import { BookData } from "./types";
import { bookData } from "./Krolowa-Sniegu/bookData";
export function getBookData(): BookData {
  return bookData;
  throw new Error(`Unknown book: ${__SELECTED_BOOK_SLUG__}`);
}
