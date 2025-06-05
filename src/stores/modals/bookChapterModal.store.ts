import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "book-chapter-modal";

interface BookChapterModalState {
  isOpen: boolean;
  chapter: number | undefined;

  openModal: (chapter?: number) => void;
  closeModal: () => void;
}

export const useBookChapterModal = create<BookChapterModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      chapter: undefined,

      openModal: (chapter) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID, true)) {
          // Allow replacing current modal
          set({ isOpen: true, chapter });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, chapter: undefined });
      },
    }),
    { name: "book-chapter-modal" },
  ),
);
