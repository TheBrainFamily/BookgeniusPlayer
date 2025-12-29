import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { useModalCoordinator } from "../modalCoordinator.store";

export interface BackgroundEditModalParams {
  cueId: string;
  fileBasename: string;
  chapter: number;
  paragraph: number;
  currentBackgroundUrl?: string;
  backgroundColor?: string;
  textColor?: string;
}

const MODAL_ID = "background-edit-modal";

interface BackgroundEditModalState {
  isOpen: boolean;
  cueId: string | null;
  fileBasename: string | null;
  chapter: number | null;
  paragraph: number | null;
  currentBackgroundUrl: string | null;
  backgroundColor: string | null;
  textColor: string | null;

  openModal: (params: BackgroundEditModalParams, replaceCurrentModal?: boolean) => void;
  closeModal: () => void;
}

export const useBackgroundEditModal = create<BackgroundEditModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      cueId: null,
      fileBasename: null,
      chapter: null,
      paragraph: null,
      currentBackgroundUrl: null,
      backgroundColor: null,
      textColor: null,

      openModal: ({ cueId, fileBasename, chapter, paragraph, currentBackgroundUrl, backgroundColor, textColor }: BackgroundEditModalParams, replaceCurrentModal = false) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID, replaceCurrentModal)) {
          set({
            isOpen: true,
            cueId,
            fileBasename,
            chapter,
            paragraph,
            currentBackgroundUrl: currentBackgroundUrl ?? null,
            backgroundColor: backgroundColor ?? null,
            textColor: textColor ?? null,
          });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, cueId: null, fileBasename: null, chapter: null, paragraph: null, currentBackgroundUrl: null, backgroundColor: null, textColor: null });
      },
    }),
    { name: "background-edit-modal" },
  ),
);
