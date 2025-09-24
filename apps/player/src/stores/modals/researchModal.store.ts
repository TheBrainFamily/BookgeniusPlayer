import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";
import { useContentShift } from "../contentShift.store";

const MODAL_ID = "research-modal";

interface ResearchModalState {
  isOpen: boolean;
  content?: string;
  layoutView?: boolean;
  hideOverlay?: boolean;
  isLoading: boolean;
  state: "deep" | "ask";

  openModal: (content?: string, layoutView?: boolean, hideOverlay?: boolean, state?: "deep" | "ask") => void;
  closeModal: () => void;
  setContent: (content: string) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useResearchModal = create<ResearchModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      content: undefined,
      layoutView: false,
      hideOverlay: false,
      isLoading: false,
      state: "ask",

      openModal: (content, layoutView, hideOverlay, state) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          // Enable content shift if opening in layout view
          if (layoutView) {
            useContentShift.getState().enableContentShift();
          }

          set({
            isOpen: true,
            content,
            layoutView,
            hideOverlay,
            isLoading: !content, // If no content provided, show loading state
            state,
          });
        }
      },

      closeModal: () => {
        // Disable content shift when closing modal
        useContentShift.getState().disableContentShift();

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
