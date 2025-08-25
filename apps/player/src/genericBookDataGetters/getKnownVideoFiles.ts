import { bookDataLoader } from "@player/services/bookDataLoader";

let cachedKnownVideoFiles: string[] | null = null;

export const getKnownVideoFiles = (): string[] => {
  if (!cachedKnownVideoFiles) {
    throw new Error("Known video files not loaded. Call loadKnownVideoFiles() first.");
  }
  return cachedKnownVideoFiles;
};

export const loadKnownVideoFiles = async (): Promise<string[]> => {
  if (!cachedKnownVideoFiles) {
    cachedKnownVideoFiles = await bookDataLoader.getKnownVideoFiles();
  }
  return cachedKnownVideoFiles;
};

export const clearKnownVideoFilesCache = () => {
  cachedKnownVideoFiles = null;
};
