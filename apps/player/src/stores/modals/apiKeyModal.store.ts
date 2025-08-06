import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "api-key-modal";

interface ApiKeyModalState {
  isOpen: boolean;
  onSuccess?: () => void;

  openModal: (onSuccess?: () => void) => void;
  closeModal: () => void;
}

export const useApiKeyModal = create<ApiKeyModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      onSuccess: undefined,

      openModal: (onSuccess) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID, true)) {
          // Allow replacing current modal
          set({ isOpen: true, onSuccess });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, onSuccess: undefined });
      },
    }),
    { name: "api-key-modal" },
  ),
);
