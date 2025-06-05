import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "editor-mode-modal";

interface EditorModeModalState {
  isOpen: boolean;
  modalType: "edit-paragraph" | "add-character" | "remove-character" | null;
  onSubmit: ((characterSlug?: string) => Promise<void>) | null;

  openModal: (modalType: "edit-paragraph" | "add-character" | "remove-character", onSubmit: (characterSlug?: string) => Promise<void>) => void;
  closeModal: () => void;
}

export const useEditorModeModal = create<EditorModeModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      modalType: null,
      onSubmit: null,

      openModal: (modalType, onSubmit) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, modalType, onSubmit });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, modalType: null, onSubmit: null });
      },
    }),
    { name: "editor-mode-modal" },
  ),
);
