import { create } from "zustand";

export interface ParagraphCache {
  [paragraphIndex: number]: string;
}

export interface ChapterCache {
  [chapterId: number]: ParagraphCache;
}

interface BookContentState {
  textCache: ChapterCache;
  addParagraphsToCache: (chapterId: number, paragraphs: ParagraphCache) => void;
  isInitialized: boolean;
  setInitialized: () => void;
}

export const useBookContentStore = create<BookContentState>((set) => ({
  textCache: {},
  isInitialized: false,
  setInitialized: () => set({ isInitialized: true }),
  addParagraphsToCache: (chapterId, newParagraphs) =>
    set((state) => {
      const chapter = state.textCache[chapterId] || {};
      const updatedParagraphs = { ...chapter, ...newParagraphs };
      return { textCache: { ...state.textCache, [chapterId]: updatedParagraphs } };
    }),
}));
