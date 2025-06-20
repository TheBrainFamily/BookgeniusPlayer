import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "quiz-modal";

export interface QuizAnswer {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  question: string;
  answers: QuizAnswer[];
}

interface QuizModalState {
  isOpen: boolean;
  question: QuizQuestion | null;
  openModal: (question?: QuizQuestion) => void;
  closeModal: () => void;
}

export const useQuizModal = create<QuizModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      question: null,

      openModal: (question) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, question });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, question: null });
      },
    }),
    { name: "quiz-modal" },
  ),
);
