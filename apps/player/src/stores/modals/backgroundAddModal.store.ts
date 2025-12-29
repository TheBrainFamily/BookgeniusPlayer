import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { useModalCoordinator } from "../modalCoordinator.store";

export interface BackgroundAddModalParams {
  chapter: number;
  paragraph: number;
}

const MODAL_ID = "background-add-modal";

interface BackgroundAddModalState {
  isOpen: boolean;
  chapter: number | null;
  paragraph: number | null;

  openModal: (params: BackgroundAddModalParams, replaceCurrentModal?: boolean) => void;
  closeModal: () => void;
}

export const useBackgroundAddModal = create<BackgroundAddModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      chapter: null,
      paragraph: null,

      openModal: ({ chapter, paragraph }: BackgroundAddModalParams, replaceCurrentModal = false) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID, replaceCurrentModal)) {
          set({ isOpen: true, chapter, paragraph });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, chapter: null, paragraph: null });
      },
    }),
    { name: "background-add-modal" },
  ),
);
