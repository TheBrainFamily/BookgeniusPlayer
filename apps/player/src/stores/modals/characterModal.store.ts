import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

export interface CharacterModalParams {
  characterSlug: string;
  isVideo: boolean;
  mediaSrc: string;
  chapter?: number;
  paragraph?: number;
}

const MODAL_ID = "character-modal";

interface CharacterModalState {
  isOpen: boolean;
  slug: string | null;
  isVideo: boolean;
  mediaSrc: string | null;
  chapter: number | null;
  paragraph: number | null;

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
      chapter: null,
      paragraph: null,

      openModal: ({ characterSlug, isVideo, mediaSrc, chapter, paragraph }: CharacterModalParams) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({ isOpen: true, slug: characterSlug, isVideo, mediaSrc, chapter: chapter ?? null, paragraph: paragraph ?? null });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, slug: null, isVideo: false, mediaSrc: null, chapter: null, paragraph: null });
      },
    }),
    { name: "character-modal" },
  ),
);
