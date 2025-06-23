import { useEffect } from "react";

import { useLocationRange } from "./useLocationRange";
import { useQuizModal } from "@/stores/modals/quizModal.store";
import { getQuizQuestions } from "../../public_books/Alice-Wonderland/getQuizQuestions";

export function useQuizz() {
  const {
    debouncedLocation: { currentChapter },
  } = useLocationRange(300);
  const { openModal: openQuizModal } = useQuizModal();

  const getQuestions = () => {
    const clickedSentences = JSON.parse(localStorage.getItem("clickedSentences") || "[]");

    const quizQuestions = getQuizQuestions();
    return quizQuestions.filter((question) => !clickedSentences.includes(question.id));
  };

  useEffect(() => {
    const questions = getQuestions().sort((a, b) => (b.score || 0) - (a.score || 0));

    console.log("23: questions[0] BANG!", questions[0]);

    if (currentChapter >= 1) {
      // const question = {
      // id: "q3",
      // question: `What is currentChapter ${currentChapter}?`,
      // answers: [
      //   { id: "a1", text: "3", isCorrect: false },
      //   { id: "a2", text: "4", isCorrect: true },
      //   { id: "a3", text: "5", isCorrect: false },
      //   { id: "a4", text: "6", isCorrect: false },
      // ],
      // };
      openQuizModal(questions[0]);
    }
  }, [currentChapter]);
}
