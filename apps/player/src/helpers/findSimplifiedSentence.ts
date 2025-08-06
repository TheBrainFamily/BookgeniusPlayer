import { getAllVariants } from "@/genericBookDataGetters/getAllVariants";

export function findSimplifiedSentence(id: string, currentScore: number) {
  const allVariants = getAllVariants();
  const foundSentence = allVariants.find((s) => s.id === id);
  if (!foundSentence) {
    return;
  }

  const allVersions = [
    { score: foundSentence.analysis.score, text: foundSentence.analysis.originalSentence },
    ...foundSentence.simplifications.map((s) => ({ score: s.score, text: s.sentences.join(" ") })),
  ];

  if (!currentScore) {
    currentScore = Math.max(...allVersions.map((v) => v.score));
  }

  const lowerVersions = allVersions.filter((v) => v.score < currentScore);

  if (lowerVersions.length === 0) {
    // No lower version available, do nothing or handle as needed
    return { text: null, score: null, hasLower: false };
  }

  lowerVersions.sort((a, b) => b.score - a.score);
  return { text: lowerVersions[0].text, score: lowerVersions[0].score, hasLower: lowerVersions.length > 1 };
}
