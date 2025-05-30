import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "book-menu-modal";

interface BookMenuModalState {
  isOpen: boolean;

  openModal: () => void;
  closeModal: () => void;
}

export const useBookMenuModal = create<BookMenuModalState>()(
  devtools(
    (set) => ({
      isOpen: false,

      openModal: () => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false });
      },
    }),
    { name: "book-menu-modal" },
  ),
);
