export enum BOOK_SLUGS {
  PHARAON = "Pharaon",
  _1984 = "1984",
  Conrad_Tajny_Agent = "Conrad-Tajny-Agent",
  Krolowa_Sniegu = "Krolowa-Sniegu",
  _1984_English = "1984-English",
}

// This will be replaced by Vite's `define` feature in vite.config.mts
// We need to declare it globally for TypeScript to know about it during type checking
// in other files that might import CURRENT_BOOK before Vite's define kicks in for them.
// However, for this specific file, the cast is sufficient.
declare global {
  const __SELECTED_BOOK_SLUG__: BOOK_SLUGS;
}

export const CURRENT_BOOK: BOOK_SLUGS = typeof __SELECTED_BOOK_SLUG__ !== "undefined" ? __SELECTED_BOOK_SLUG__ : (process.env.VITE_BOOK as BOOK_SLUGS); // Default fallback
