import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface GeneratingBackground {
  chapter: number;
  paragraph: number;
  prompt: string;
  type: "add" | "edit";
  startedAt: number;
}

export interface ReadyBackground extends GeneratingBackground {
  completedAt: number;
}

interface BackgroundGenerationState {
  generatingBackgrounds: Map<string, GeneratingBackground>;
  readyBackgrounds: Map<string, ReadyBackground>;

  startGeneration: (key: string, data: Omit<GeneratingBackground, "startedAt">) => void;
  completeGeneration: (key: string) => void;
  dismissReady: (key: string) => void;
}

const createKey = (chapter: number, paragraph: number) => `${chapter}-${paragraph}`;

export const useBackgroundGenerationStore = create<BackgroundGenerationState>()(
  devtools(
    (set, _get) => ({
      generatingBackgrounds: new Map(),
      readyBackgrounds: new Map(),

      startGeneration: (key: string, data: Omit<GeneratingBackground, "startedAt">) => {
        set((state) => {
          const nextGenerating = new Map(state.generatingBackgrounds);
          const nextReady = new Map(state.readyBackgrounds);
          nextGenerating.set(key, { ...data, startedAt: Date.now() });
          nextReady.delete(key);
          return { generatingBackgrounds: nextGenerating, readyBackgrounds: nextReady };
        });
      },

      completeGeneration: (key: string) => {
        set((state) => {
          const generating = state.generatingBackgrounds.get(key);
          const nextGenerating = new Map(state.generatingBackgrounds);
          const nextReady = new Map(state.readyBackgrounds);
          nextGenerating.delete(key);
          if (generating) {
            nextReady.set(key, { ...generating, completedAt: Date.now() });
          }
          return { generatingBackgrounds: nextGenerating, readyBackgrounds: nextReady };
        });
      },

      dismissReady: (key: string) => {
        set((state) => {
          const next = new Map(state.readyBackgrounds);
          next.delete(key);
          return { readyBackgrounds: next };
        });
      },
    }),
    { name: "background-generation" },
  ),
);

export { createKey as createBackgroundKey };
