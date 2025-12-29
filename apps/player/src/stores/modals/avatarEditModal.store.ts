import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { useModalCoordinator } from "../modalCoordinator.store";

export interface AvatarEditModalParams {
  characterSlug: string;
  characterDisplayName: string;
  currentAvatarUrl?: string;
  aiPrompt?: string;
}

const MODAL_ID = "avatar-edit-modal";

interface AvatarEditModalState {
  isOpen: boolean;
  characterSlug: string | null;
  characterDisplayName: string | null;
  currentAvatarUrl: string | null;
  aiPrompt: string | null;

  openModal: (params: AvatarEditModalParams, replaceCurrentModal?: boolean) => void;
  closeModal: () => void;
}

export const useAvatarEditModal = create<AvatarEditModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      characterSlug: null,
      characterDisplayName: null,
      currentAvatarUrl: null,
      aiPrompt: null,

      openModal: ({ characterSlug, characterDisplayName, currentAvatarUrl, aiPrompt }: AvatarEditModalParams, replaceCurrentModal = false) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID, replaceCurrentModal)) {
          set({ isOpen: true, characterSlug, characterDisplayName, currentAvatarUrl: currentAvatarUrl ?? null, aiPrompt: aiPrompt ?? null });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, characterSlug: null, characterDisplayName: null, currentAvatarUrl: null, aiPrompt: null });
      },
    }),
    { name: "avatar-edit-modal" },
  ),
);
