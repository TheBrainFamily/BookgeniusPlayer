import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { useModalCoordinator } from "../modalCoordinator.store";

export interface ImageModalParams {
  src: string;
  alt?: string;
}

const MODAL_ID = "image-modal";

interface ImageModalState {
  isOpen: boolean;
  src?: string;
  alt?: string;

  openModal: (params: ImageModalParams) => void;
  closeModal: () => void;
}

export const useImageModal = create<ImageModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      src: undefined,
      alt: undefined,

      openModal: ({ src, alt }: ImageModalParams) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, src, alt });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, src: undefined, alt: undefined });
      },
    }),
    { name: "image-modal" },
  ),
);
