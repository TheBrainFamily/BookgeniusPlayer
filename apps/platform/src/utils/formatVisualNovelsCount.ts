import { detectLanguageFromDomain } from "@platform/utils/languageDetection.ts";

export const formatVisualNovelsCount = (count: number): string => {
  const language = detectLanguageFromDomain();

  if (language === "en") {
    if (count === 1) {
      return `Visual Novel`;
    }
    return `Visual Novels`;
  }

  if (count === 1) {
    return `Nowela Wizualna`;
  }

  const lastTwo = count % 100;
  const lastOne = count % 10;

  if (lastTwo >= 12 && lastTwo <= 14) {
    return `Nowel Wizualnych`;
  }

  if (lastOne === 2 || lastOne === 3 || lastOne === 4) {
    return `Nowele Wizualne`;
  }

  return `Nowel Wizualnych`;
};
