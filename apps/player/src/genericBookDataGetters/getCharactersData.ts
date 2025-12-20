import type { CharacterData } from "@player/types/book";
import { bookDataLoader } from "@player/services/bookDataLoader";

let cachedCharactersData: CharacterData[] | null = null;

export const getCharactersData = (): CharacterData[] => {
  if (!cachedCharactersData) {
    throw new Error("Characters data not loaded. Call loadCharactersData() first.");
  }
  console.log("getCharactersData: Returning cached characters data:", cachedCharactersData);
  return cachedCharactersData;
};

export const loadCharactersData = async (): Promise<CharacterData[]> => {
  if (!cachedCharactersData) {
    cachedCharactersData = await bookDataLoader.getCharactersData();
  }
  return cachedCharactersData;
};

export const clearCharactersDataCache = () => {
  cachedCharactersData = null;
};

// For live mode: directly inject characters data into cache
export const setCharactersDataCache = (value: CharacterData[]) => {
  cachedCharactersData = value;
};
