import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "character-modal";

interface CharacterModalState {
  isOpen: boolean;
  slug: string | null;
  isVideo: boolean;
  mediaSrc: string | null;

  openModal: (slug: string, isVideo: boolean, mediaSrc: string) => void;
  closeModal: () => void;
}

export const useCharacterModal = create<CharacterModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      slug: null,
      isVideo: false,
      mediaSrc: null,

      openModal: (slug, isVideo, mediaSrc) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, slug, isVideo, mediaSrc });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, slug: null, isVideo: false, mediaSrc: null });
      },
    }),
    { name: "character-modal" },
  ),
);
