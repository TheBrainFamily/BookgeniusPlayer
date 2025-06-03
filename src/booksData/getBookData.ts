import { BookData } from "./types";
import { BOOK_SLUGS } from "@/consts";
import { bookData as _1984BookData } from "./books/1984BookData";
// import { bookData as PharaonBookData } from "./books/pharaonBookData";
// import { bookData as KrolowaSnieguBookData } from "./books/krolowa-snieguBookData";
// import { bookData as ConradTajnyAgentBookData } from "./books/conrad-tajny-agentBookData";
import { bookData as _1984EnglishBookData } from "./books/1984-EnglishBookData";

declare const __SELECTED_BOOK_SLUG__: string;

export function getBookData(): BookData {
  if (__SELECTED_BOOK_SLUG__ === BOOK_SLUGS._1984) {
    return _1984BookData;
    // } else if (__SELECTED_BOOK_SLUG__ === BOOK_SLUGS.PHARAON) {
    // return PharaonBookData;
    // } else if (__SELECTED_BOOK_SLUG__ === BOOK_SLUGS.Conrad_Tajny_Agent) {
    // return ConradTajnyAgentBookData;
    // } else if (__SELECTED_BOOK_SLUG__ === BOOK_SLUGS.Krolowa_Sniegu) {
    // return KrolowaSnieguBookData;
  } else if (__SELECTED_BOOK_SLUG__ === BOOK_SLUGS._1984_English) {
    return _1984EnglishBookData;
  }

  throw new Error(`Unknown book: ${__SELECTED_BOOK_SLUG__}`);
}
