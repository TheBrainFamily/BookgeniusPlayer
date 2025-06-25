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
  currentChapter: number | null;
  sentence: string | null;
  userResponses: Record<string, string>;
  openModal: (questions: QuizQuestion[], sentence: string, chapter: number) => void;
  closeModal: () => void;
  nextQuestion: () => void;
  previousQuestion: () => void;
  setUserResponse: (questionId: string, answerId: string) => void;
  markChapterQuizCompleted: (chapter: number) => void;
}

export const useQuizModal = create<QuizModalState>()(
  devtools(
    (set, get) => ({
      isOpen: false,
      questions: [],
      currentQuestionIndex: 0,
      currentChapter: null,
      sentence: null,
      userResponses: {},
      openModal: (questions, sentence, chapter) => {
        if (!questions || questions.length === 0) return;

        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, questions, currentQuestionIndex: 0, currentChapter: chapter, sentence, userResponses: {} });
        }
      },
      nextQuestion: () => {
        const { questions, currentQuestionIndex, currentChapter, closeModal, markChapterQuizCompleted } = get();
        if (currentQuestionIndex < questions.length - 1) {
          set({ currentQuestionIndex: currentQuestionIndex + 1 });
        } else {
          // Quiz completed - mark chapter as completed
          if (currentChapter !== null) {
            markChapterQuizCompleted(currentChapter);
          }
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
        set({ isOpen: false, questions: [], currentQuestionIndex: 0, currentChapter: null, sentence: null });
      },
      setUserResponse: (questionId: string, answerId: string) => {
        set((state) => ({ userResponses: { ...state.userResponses, [questionId]: answerId } }));
      },
      markChapterQuizCompleted: (chapter: number) => {
        const completedQuizzes = JSON.parse(localStorage.getItem("completedChapterQuizzes") || "[]");
        if (!completedQuizzes.includes(chapter)) {
          completedQuizzes.push(chapter);
          localStorage.setItem("completedChapterQuizzes", JSON.stringify(completedQuizzes));
        }
      },
    }),
    { name: "quiz-modal" },
  ),
);
