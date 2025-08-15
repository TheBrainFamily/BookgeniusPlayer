import type { CharacterData } from "@player/types/book";
import { bookDataLoader } from "@player/services/bookDataLoader";

let cachedCharactersData: CharacterData[] | null = null;

export const getCharactersData = (): CharacterData[] => {
  if (!cachedCharactersData) {
    throw new Error("Characters data not loaded. Call loadCharactersData() first.");
  }
  return cachedCharactersData;
};

export const loadCharactersData = async (): Promise<CharacterData[]> => {
  if (!cachedCharactersData) {
    cachedCharactersData = await bookDataLoader.getCharactersData();
  }
  return cachedCharactersData;
};
