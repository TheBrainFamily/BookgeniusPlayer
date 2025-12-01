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
  showDiveDeeperCTA: boolean;
  isDiveDeeperLoading: boolean;
  diveDeeperHandler?: () => void | Promise<void>;
  type: "deep" | "ask";
  openModal: (content?: string, layoutView?: boolean, hideOverlay?: boolean, type?: "deep" | "ask") => void;
  closeModal: () => void;
  setContent: (content: string) => void;
  setLoading: (isLoading: boolean) => void;
  setShowDiveDeeperCTA: (show: boolean) => void;
  setDiveDeeperLoading: (loading: boolean) => void;
  setDiveDeeperHandler: (handler?: () => void | Promise<void>) => void;
  setType: (type: "deep" | "ask") => void;
  clearModal: () => void;
}

export const useDeepResearchModal = create<DeepResearchModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      content: undefined,
      layoutView: false,
      hideOverlay: false,
      isLoading: false,
      showDiveDeeperCTA: false,
      isDiveDeeperLoading: false,
      diveDeeperHandler: undefined,
      type: "ask",

      openModal: (content, layoutView, hideOverlay, modalType) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          // Content shift is now handled by DeepResearchModalRenderer
          set({
            isOpen: true,
            content,
            layoutView,
            hideOverlay,
            isLoading: !content, // If no content provided, show loading state
            showDiveDeeperCTA: false,
            isDiveDeeperLoading: false,
            diveDeeperHandler: undefined,
            type: modalType ?? "ask",
          });
        }
      },

      closeModal: () => {
        // Content shift is now handled by DeepResearchModalRenderer (via onExitComplete)
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, isLoading: false, showDiveDeeperCTA: false, isDiveDeeperLoading: false, diveDeeperHandler: undefined, type: "ask" });
      },

      clearModal: () => {
        set({ content: undefined, isLoading: false, showDiveDeeperCTA: false, isDiveDeeperLoading: false, diveDeeperHandler: undefined, type: "ask" });
      },

      setContent: (content) => set({ content, isLoading: false }),
      setLoading: (isLoading) => set({ isLoading }),
      setShowDiveDeeperCTA: (show) => set({ showDiveDeeperCTA: show }),
      setDiveDeeperLoading: (loading) => set({ isDiveDeeperLoading: loading }),
      setDiveDeeperHandler: (handler) => set({ diveDeeperHandler: handler }),
      setType: (type) => set({ type }),
    }),
    { name: "deep-research-modal" },
  ),
);
