import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "footnote-modal";

interface FootnoteModalState {
  isOpen: boolean;
  html: string;

  openModal: (html: string) => void;
  closeModal: () => void;
}

export const useFootnoteModal = create<FootnoteModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      html: "",

      openModal: (html: string) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, html });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, html: "" });
      },
    }),
    { name: "footnote-modal" },
  ),
);
