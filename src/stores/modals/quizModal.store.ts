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
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  sentence: string | null;
  openModal: (questions: QuizQuestion[], sentence: string) => void;
  closeModal: () => void;
  nextQuestion: () => void;
  previousQuestion: () => void;
}

export const useQuizModal = create<QuizModalState>()(
  devtools(
    (set, get) => ({
      isOpen: false,
      questions: [],
      currentQuestionIndex: 0,
      sentence: null,
      openModal: (questions, sentence) => {
        if (!questions || questions.length === 0) return;

        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, questions, currentQuestionIndex: 0, sentence });
        }
      },
      nextQuestion: () => {
        const { questions, currentQuestionIndex, closeModal } = get();
        if (currentQuestionIndex < questions.length - 1) {
          set({ currentQuestionIndex: currentQuestionIndex + 1 });
        } else {
          closeModal();
        }
      },
      previousQuestion: () => {
        const { currentQuestionIndex } = get();
        if (currentQuestionIndex > 0) {
          set({ currentQuestionIndex: currentQuestionIndex - 1 });
        }
      },
      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, questions: [], currentQuestionIndex: 0, sentence: null });
      },
    }),
    { name: "quiz-modal" },
  ),
);
