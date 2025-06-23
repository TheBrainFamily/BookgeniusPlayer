import React from "react";
import { createPortal } from "react-dom";
import { useQuizModal } from "@/stores/modals/quizModal.store";
import QuizModal from "@/components/modals/QuizModal";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export const QuizModalRenderer: React.FC = () => {
  const { isOpen, question, closeModal } = useQuizModal();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(<QuizModal onClose={closeModal} question={question} />, document.body);
};
