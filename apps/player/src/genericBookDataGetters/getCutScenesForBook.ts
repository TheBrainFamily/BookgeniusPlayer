import type { CutSceneForBook } from "@/types/book";
import { bookDataLoader } from "@/services/bookDataLoader";

let cachedCutScenes: CutSceneForBook[] | null = null;

export const getCutScenesForBook = (): CutSceneForBook[] => {
  if (!cachedCutScenes) {
    throw new Error("Cut scenes not loaded. Call loadCutScenesForBook() first.");
  }
  return cachedCutScenes;
};

export const loadCutScenesForBook = async (): Promise<CutSceneForBook[]> => {
  if (!cachedCutScenes) {
    cachedCutScenes = await bookDataLoader.getCutScenesForBook();
  }
  return cachedCutScenes;
};
