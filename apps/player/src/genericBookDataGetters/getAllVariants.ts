import { bookDataLoader } from "@player/services/bookDataLoader";

export type Variant = {
  id: string;
  analysis: { originalSentence: string; reasoning: string; score: number };
  simplifications: { reasoning: string; score: number; sentences: string[] }[];
};

let cachedVariants: Variant[] | null = null;

export const getAllVariants = (): Variant[] => {
  if (!cachedVariants) {
    throw new Error("Variants not loaded. Call loadAllVariants() first.");
  }
  return cachedVariants;
};

export const loadAllVariants = async (): Promise<Variant[]> => {
  if (!cachedVariants) {
    cachedVariants = await bookDataLoader.getAllVariants();
  }
  return cachedVariants;
};

export const reloadAllVariants = async (): Promise<void> => {
  cachedVariants = await bookDataLoader.getAllVariants();
};

export const clearAllVariantsCache = () => {
  cachedVariants = null;
};

// For live mode: directly inject variants into cache
export const setAllVariantsCache = (value: Variant[]) => {
  cachedVariants = value;
};
