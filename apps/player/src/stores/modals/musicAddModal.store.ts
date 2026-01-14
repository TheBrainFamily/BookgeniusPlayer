import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { useModalCoordinator } from "../modalCoordinator.store";

export interface MusicAddModalParams {
  chapter: number;
  paragraph: number;
}

const MODAL_ID = "music-add-modal";

interface MusicAddModalState {
  isOpen: boolean;
  chapter: number | null;
  paragraph: number | null;

  openModal: (params: MusicAddModalParams, replaceCurrentModal?: boolean) => void;
  closeModal: () => void;
}

export const useMusicAddModal = create<MusicAddModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      chapter: null,
      paragraph: null,

      openModal: ({ chapter, paragraph }: MusicAddModalParams, replaceCurrentModal = false) => {
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
    { name: "music-add-modal" },
  ),
);
