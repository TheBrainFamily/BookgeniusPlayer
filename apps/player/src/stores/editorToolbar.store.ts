/**
 * EditorToolbar Store
 *
 * Manages the state of the floating editor toolbar that appears when
 * the user holds the Command key. Tracks current background and music
 * cues with their range information.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface CurrentBackgroundCue {
  cueId: string;
  fileBasename: string;
  startChapter: number;
  startParagraph: number;
  endChapter: number;
  endParagraph: number;
  backgroundColor?: string;
  textColor?: string;
  url?: string;
  previewUrl?: string;
}

export interface CurrentMusicCue {
  cueId: string;
  fileBasename: string;
  chapter: number;
  paragraph: number;
  endChapter: number;
  endParagraph: number;
  title?: string;
  artist?: string;
  coverUrl?: string;
  url?: string;
}

interface EditorToolbarState {
  currentBackground: CurrentBackgroundCue | null;
  currentMusic: CurrentMusicCue | null;
  setCurrentBackground: (background: CurrentBackgroundCue | null) => void;
  setCurrentMusic: (music: CurrentMusicCue | null) => void;
  clearAll: () => void;
}

export const useEditorToolbar = create<EditorToolbarState>()(
  devtools(
    (set) => ({
      currentBackground: null,
      currentMusic: null,

      setCurrentBackground: (background) => set({ currentBackground: background }),
      setCurrentMusic: (music) => set({ currentMusic: music }),
      clearAll: () => set({ currentBackground: null, currentMusic: null }),
    }),
    { name: "editor-toolbar" },
  ),
);
