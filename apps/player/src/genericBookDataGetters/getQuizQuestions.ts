import type { QuizOutput } from "@/types/book";
import { bookDataLoader } from "@/services/bookDataLoader";

let cachedQuizQuestions: QuizOutput[] | null = null;

export const getQuizQuestions = (): QuizOutput[] => {
  if (!cachedQuizQuestions) {
    throw new Error("Quiz questions not loaded. Call loadQuizQuestions() first.");
  }
  return cachedQuizQuestions;
};

export const loadQuizQuestions = async (): Promise<QuizOutput[]> => {
  if (!cachedQuizQuestions) {
    cachedQuizQuestions = await bookDataLoader.getQuizQuestions();
  }
  return cachedQuizQuestions;
};
