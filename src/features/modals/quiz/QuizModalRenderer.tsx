import React from "react";
import { createPortal } from "react-dom";
import { useQuizModal } from "@/stores/modals/quizModal.store";
import QuizModal from "@/components/modals/QuizModal";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export const QuizModalRenderer: React.FC = () => {
  const { isOpen, questions, currentQuestionIndex, closeModal, nextQuestion, previousQuestion, sentence } = useQuizModal();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen || !questions.length) return null;

  const currentQuestion = questions[currentQuestionIndex];
  if (!currentQuestion) return null;

  return createPortal(
    <QuizModal
      onClose={closeModal}
      question={currentQuestion}
      nextQuestion={nextQuestion}
      previousQuestion={previousQuestion}
      currentQuestionIndex={currentQuestionIndex}
      totalQuestions={questions.length}
      sentence={sentence}
    />,
    document.body,
  );
};
