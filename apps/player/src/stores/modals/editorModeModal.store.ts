import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "editor-mode-modal";

type EditorModalType = "edit-paragraph" | "add-character" | "remove-character" | "set-talking-character";

interface EditorModeModalState {
  isOpen: boolean;
  modalType: EditorModalType | null;
  onSubmit: ((characterSlug?: string) => Promise<void>) | null;

  chapterNumber: number | null;
  paragraphIndex: number | null;
  currentSpeaker: string | null;

  openModal: (modalType: EditorModalType, onSubmit: (characterSlug?: string) => Promise<void>) => void;
  openTalkingCharacterModal: (chapterNumber: number, paragraphIndex: number, currentSpeaker: string | null, onSubmit: (characterSlug?: string) => Promise<void>) => void;
  closeModal: () => void;
}

export const useEditorModeModal = create<EditorModeModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      modalType: null,
      onSubmit: null,
      chapterNumber: null,
      paragraphIndex: null,
      currentSpeaker: null,

      openModal: (modalType, onSubmit) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, modalType, onSubmit, chapterNumber: null, paragraphIndex: null, currentSpeaker: null });
        }
      },

      openTalkingCharacterModal: (chapterNumber, paragraphIndex, currentSpeaker, onSubmit) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, modalType: "set-talking-character", chapterNumber, paragraphIndex, currentSpeaker, onSubmit });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, modalType: null, onSubmit: null, chapterNumber: null, paragraphIndex: null, currentSpeaker: null });
      },
    }),
    { name: "editor-mode-modal" },
  ),
);
