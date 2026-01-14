import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { useModalCoordinator } from "../modalCoordinator.store";

export interface NoteEditModalParams {
  noteId: string;
  content: string;
  bookPath: string;
}

const MODAL_ID = "note-edit-modal";

interface NoteEditModalState {
  isOpen: boolean;
  noteId: string | null;
  content: string | null;
  bookPath: string | null;

  openModal: (params: NoteEditModalParams) => void;
  closeModal: () => void;
}

export const useNoteEditModal = create<NoteEditModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      noteId: null,
      content: null,
      bookPath: null,

      openModal: ({ noteId, content, bookPath }: NoteEditModalParams) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, noteId, content, bookPath });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, noteId: null, content: null, bookPath: null });
      },
    }),
    { name: "note-edit-modal" },
  ),
);
