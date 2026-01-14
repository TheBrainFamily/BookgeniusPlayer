import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "graphics-settings-modal";

interface GraphicsSettingsModalState {
  isOpen: boolean;

  openModal: () => void;
  closeModal: () => void;
}

export const useGraphicsSettingsModal = create<GraphicsSettingsModalState>()(
  devtools(
    (set) => ({
      isOpen: false,

      openModal: () => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID, true)) {
          set({ isOpen: true });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false });
      },
    }),
    { name: "graphics-settings-modal" },
  ),
);
