import { bookDataLoader } from "@player/services/bookDataLoader";

let cachedBookStringified: string | null = null;

export const getBookStringified = (): string => {
  if (!cachedBookStringified) {
    throw new Error("Book stringified not loaded. Call loadBookStringified() first.");
  }
  return cachedBookStringified;
};

export const loadBookStringified = async (): Promise<string> => {
  if (!cachedBookStringified) {
    cachedBookStringified = await bookDataLoader.getBookStringified();
  }
  return cachedBookStringified;
};

// Force reload the book stringified data
export const reloadBookStringified = async (): Promise<void> => {
  // Reload the data (loader always fetches fresh now)
  cachedBookStringified = await bookDataLoader.getBookStringified();

  console.log("Book stringified data reloaded");
};

export const clearBookStringifiedCache = () => {
  cachedBookStringified = null;
};

// For live mode: directly inject book stringified into cache
export const setBookStringifiedCache = (value: string) => {
  cachedBookStringified = value;
};
