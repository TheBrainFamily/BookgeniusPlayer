import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { useModalCoordinator } from "../modalCoordinator.store";

export interface MusicEditModalParams {
  cueId: string;
  fileBasename: string;
  chapter: number;
  paragraph: number;
  currentMusicUrl?: string;
  title?: string;
  artist?: string;
  coverUrl?: string;
}

const MODAL_ID = "music-edit-modal";

interface MusicEditModalState {
  isOpen: boolean;
  cueId: string | null;
  fileBasename: string | null;
  chapter: number | null;
  paragraph: number | null;
  currentMusicUrl: string | null;
  title: string | null;
  artist: string | null;
  coverUrl: string | null;

  openModal: (params: MusicEditModalParams, replaceCurrentModal?: boolean) => void;
  closeModal: () => void;
}

export const useMusicEditModal = create<MusicEditModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      cueId: null,
      fileBasename: null,
      chapter: null,
      paragraph: null,
      currentMusicUrl: null,
      title: null,
      artist: null,
      coverUrl: null,

      openModal: (
        {
          cueId,
          fileBasename,
          chapter,
          paragraph,
          currentMusicUrl,
          title,
          artist,
          coverUrl,
        }: MusicEditModalParams,
        replaceCurrentModal = false,
      ) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID, replaceCurrentModal)) {
          set({
            isOpen: true,
            cueId,
            fileBasename,
            chapter,
            paragraph,
            currentMusicUrl: currentMusicUrl ?? null,
            title: title ?? null,
            artist: artist ?? null,
            coverUrl: coverUrl ?? null,
          });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({
          isOpen: false,
          cueId: null,
          fileBasename: null,
          chapter: null,
          paragraph: null,
          currentMusicUrl: null,
          title: null,
          artist: null,
          coverUrl: null,
        });
      },
    }),
    { name: "music-edit-modal" },
  ),
);
