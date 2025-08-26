import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

export interface CharacterModalParams {
  characterSlug: string;
  isVideo: boolean;
  mediaSrc: string;
}

const MODAL_ID = "character-modal";

interface CharacterModalState {
  isOpen: boolean;
  slug: string | null;
  isVideo: boolean;
  mediaSrc: string | null;

  openModal: (params: CharacterModalParams) => void;
  closeModal: () => void;
}

export const useCharacterModal = create<CharacterModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      slug: null,
      isVideo: false,
      mediaSrc: null,

      openModal: ({ characterSlug, isVideo, mediaSrc }: CharacterModalParams) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, slug: characterSlug, isVideo, mediaSrc });
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
