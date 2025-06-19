type Variant = {
  id: string;
  analysis: { originalSentence: string; reasoning: string; score: number };
  simplifications: { reasoning: string; score: number; sentences: string[] }[];
};

export const getAllVariants = (): Variant[] => {
  throw new Error("getAllVariants should never be called at runtime");
};
