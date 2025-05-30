import { create } from "zustand";
import { devtools } from "zustand/middleware";

type ModalId = string;

interface ModalCoordinatorState {
  activeModalId: ModalId | null;
  requestModalOpen: (modalId: ModalId, replaceCurrentModal?: boolean) => boolean;
  releaseModal: (modalId: ModalId) => void;
  forceCloseAll: () => void;
}

export const useModalCoordinator = create<ModalCoordinatorState>()(
  devtools(
    (set, get) => ({
      activeModalId: null,

      requestModalOpen: (modalId, replaceCurrentModal = false) => {
        const { activeModalId } = get();
        if (activeModalId === null || activeModalId === modalId || replaceCurrentModal) {
          set({ activeModalId: modalId });
          return true;
        }
        return false;
      },

      releaseModal: (modalId) => {
        set((state) => ({ activeModalId: state.activeModalId === modalId ? null : state.activeModalId }));
      },

      forceCloseAll: () => {
        set({ activeModalId: null });
      },
    }),
    { name: "modal-coordinator" },
  ),
);
