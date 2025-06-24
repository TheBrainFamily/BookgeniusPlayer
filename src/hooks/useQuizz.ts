import { useEffect } from "react";

import { useLocationRange } from "./useLocationRange";
import { useQuizModal } from "@/stores/modals/quizModal.store";
import { getAllVariants } from "@/genericBookDataGetters/getAllVariants";
import { getQuizQuestions } from "@/genericBookDataGetters/getQuizQuestions";

export function useQuizz() {
  const {
    debouncedLocation: { currentChapter },
  } = useLocationRange(300);
  const { openModal: openQuizModal } = useQuizModal();

  const getQuestions = () => {
    const clickedSentences = JSON.parse(localStorage.getItem("clickedSentences") || "[]");

    const quizQuestions = getQuizQuestions();
    return quizQuestions.filter((question) => {
      const chapterMatch = question.id.match(/ch(\d+)/);
      const questionChapter = chapterMatch ? parseInt(chapterMatch[1]) : 0;

      return !clickedSentences.includes(question.id) && questionChapter === currentChapter - 1;
    });
  };

  useEffect(() => {
    const questions = getQuestions().sort((a, b) => (b.score || 0) - (a.score || 0));

    if (!questions.length) return;

    const sentence = getAllVariants()
      .find((question) => question.id === questions[0].id)
      .analysis.originalSentence.replace(/<[^>]*>/g, "");

    if (currentChapter >= 1) {
      openQuizModal(questions[0].questions, sentence);
    }
  }, [currentChapter]);
}
