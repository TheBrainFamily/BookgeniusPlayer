import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "sentence-modal";

interface SentenceModalState {
  isOpen: boolean;
  sentenceId?: string;
  currentSentence?: string;
  lowerSentence?: string;
  lowerSentenceScore?: number;
  openModal: (currentSentence?: string, lowerScoreSentence?: string, sentenceId?: string, lowerSentenceScore?: number) => void;
  closeModal: () => void;
}

export const useSentenceModal = create<SentenceModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      sentence: null,

      openModal: (currentSentence, lowerSentence, sentenceId, lowerSentenceScore) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, currentSentence, lowerSentence, sentenceId, lowerSentenceScore });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, currentSentence: null, lowerSentence: null, sentenceId: null, lowerSentenceScore: null });
      },
    }),
    { name: "sentence-modal" },
  ),
);
