import { useEffect } from "react";

import { useLocationRange } from "./useLocationRange";
import { useQuizModal } from "@/stores/modals/quizModal.store";

export function useQuizz() {
  return;
  const {
    debouncedLocation: { currentChapter },
  } = useLocationRange(300);
  const { openModal: openQuizModal } = useQuizModal();

  useEffect(() => {
    if (currentChapter >= 1) {
      const question = {
        id: "q3",
        question: `What is currentChapter ${currentChapter}?`,
        answers: [
          { id: "a1", text: "3", isCorrect: false },
          { id: "a2", text: "4", isCorrect: true },
          { id: "a3", text: "5", isCorrect: false },
          { id: "a4", text: "6", isCorrect: false },
        ],
      };
      openQuizModal(question);
    }
  }, [currentChapter]);
}
