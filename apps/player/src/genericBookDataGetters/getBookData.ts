import type { BookData } from "@player/types/book";
import { bookDataLoader } from "@player/services/bookDataLoader";

// This is now an async wrapper that loads data at runtime
let cachedBookData: BookData | null = null;

export const getBookData = (): BookData => {
  // For synchronous compatibility, we need to have loaded the data beforehand
  if (!cachedBookData) {
    throw new Error("Book data not loaded. Call loadBookData() first.");
  }
  return cachedBookData;
};

// New async function to load book data
export const loadBookData = async (): Promise<BookData> => {
  if (!cachedBookData) {
    cachedBookData = await bookDataLoader.getBookData();
  }
  return cachedBookData;
};

export const clearBookDataCache = () => {
  cachedBookData = null;
};

// For live mode: directly inject book data into cache
export const setBookDataCache = (value: BookData) => {
  cachedBookData = value;
};
