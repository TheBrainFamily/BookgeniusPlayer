// Configuration for page numbering
export const romanNumeralPages = 1; // Number of pages that use Roman numerals
export const pagesToSkipFooterGeneration = 0; //also used for where to start prefetching

export enum BOOK_SLUGS {
  GET_SHORTY = "shorty",
  INNOCENCE = "innocence",
  TRUMP = "trump",
  PHARAON = "Pharaon",
  _1984 = "1984",
}

export const CURRENT_BOOK: BOOK_SLUGS = BOOK_SLUGS.PHARAON;
