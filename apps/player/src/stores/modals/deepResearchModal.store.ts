import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "deep-research-modal";

interface DeepResearchModalState {
  isOpen: boolean;
  content?: string;
  layoutView?: boolean;
  hideOverlay?: boolean;
  isLoading: boolean;

  openModal: (content?: string, layoutView?: boolean, hideOverlay?: boolean) => void;
  closeModal: () => void;
  setContent: (content: string) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useDeepResearchModal = create<DeepResearchModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      content: undefined,
      layoutView: false,
      hideOverlay: false,
      isLoading: false,

      openModal: (content, layoutView, hideOverlay) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({
            isOpen: true,
            content,
            layoutView,
            hideOverlay,
            isLoading: !content, // If no content provided, show loading state
          });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, content: undefined, isLoading: false });
      },

      setContent: (content) => set({ content, isLoading: false }),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    { name: "deep-research-modal" },
  ),
);
