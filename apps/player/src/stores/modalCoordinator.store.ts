import { create } from "zustand";
import { devtools } from "zustand/middleware";

type ModalId = string;

// Base modals that should allow others to open above them on wide screens
const BASE_MODALS = new Set<ModalId>(["search-modal", "deep-research-modal"]);

interface ModalCoordinatorState {
  activeModalIds: Set<ModalId>;
  requestModalOpen: (modalId: ModalId, replaceCurrentModal?: boolean) => boolean;
  releaseModal: (modalId: ModalId) => void;
  forceCloseAll: () => void;
}

export const useModalCoordinator = create<ModalCoordinatorState>()(
  devtools(
    (set, get) => ({
      activeModalIds: new Set<ModalId>(),

      requestModalOpen: (modalId, replaceCurrentModal = false) => {
        const { activeModalIds } = get();

        if (replaceCurrentModal) {
          set({ activeModalIds: new Set([modalId]) });
          return true;
        }

        if (activeModalIds.has(modalId)) {
          return true;
        }

        if (activeModalIds.size > 0) {
          const hasBaseModal = Array.from(activeModalIds).some((id) => BASE_MODALS.has(id));

          if (hasBaseModal) {
            const isWideScreen = typeof window !== "undefined" && window.innerWidth >= 1024;

            if (!isWideScreen) {
              return false;
            }
          }
        }

        const newActiveModals = new Set(activeModalIds);
        newActiveModals.add(modalId);
        set({ activeModalIds: newActiveModals });

        return true;
      },

      releaseModal: (modalId) => {
        set((state) => {
          const newActiveModals = new Set(state.activeModalIds);
          newActiveModals.delete(modalId);
          return { activeModalIds: newActiveModals };
        });
      },

      forceCloseAll: () => {
        set({ activeModalIds: new Set<ModalId>() });
      },
    }),
    { name: "modal-coordinator" },
  ),
);
