import { bookDataLoader } from "@/services/bookDataLoader";

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
