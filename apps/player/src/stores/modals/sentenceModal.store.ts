import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "sentence-modal";

interface SentenceModalState {
  isOpen: boolean;
  currentSentenceId?: string;
  currentSentence?: string;
  simplifiedSentence?: string;
  simplifiedSentenceScore?: number;
  openModal: (
    currentSentence?: string,
    simplifiedSentence?: string,
    currentSentenceId?: string,
    simplifiedSentenceScore?: number,
  ) => void;
  closeModal: () => void;
}

export const useSentenceModal = create<SentenceModalState>()(
  devtools(
    (set) => ({
      isOpen: false,

      openModal: (
        currentSentence,
        simplifiedSentence,
        currentSentenceId,
        simplifiedSentenceScore,
      ) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({
            isOpen: true,
            currentSentence,
            simplifiedSentence,
            currentSentenceId,
            simplifiedSentenceScore,
          });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({
          isOpen: false,
          currentSentence: undefined,
          simplifiedSentence: undefined,
          currentSentenceId: undefined,
          simplifiedSentenceScore: undefined,
        });
      },
    }),
    { name: "sentence-modal" },
  ),
);
