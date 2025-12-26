import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface AvatarGenerationState {
  optimisticGenerating: Set<string>;
  optimisticAvatars: Record<string, string>;
  startOptimisticGeneration: (characterSlug: string, displayName: string) => void;
  clearOptimisticGeneration: (characterSlug: string) => void;
  getDisplayName: (characterSlug: string) => string | undefined;
  setOptimisticAvatar: (characterSlug: string, avatarUrl: string) => void;
  clearOptimisticAvatar: (characterSlug: string) => void;
  getOptimisticAvatar: (characterSlug: string) => string | undefined;
}

const displayNames = new Map<string, string>();

export const useAvatarGenerationStore = create<AvatarGenerationState>()(
  devtools(
    (set, get) => ({
      optimisticGenerating: new Set(),
      optimisticAvatars: {},

      startOptimisticGeneration: (characterSlug: string, displayName: string) => {
        displayNames.set(characterSlug.toLowerCase(), displayName);
        set((state) => ({ optimisticGenerating: new Set(state.optimisticGenerating).add(characterSlug.toLowerCase()) }));
      },

      clearOptimisticGeneration: (characterSlug: string) => {
        displayNames.delete(characterSlug.toLowerCase());
        set((state) => {
          const next = new Set(state.optimisticGenerating);
          next.delete(characterSlug.toLowerCase());
          return { optimisticGenerating: next };
        });
      },

      getDisplayName: (characterSlug: string) => {
        return displayNames.get(characterSlug.toLowerCase());
      },

      setOptimisticAvatar: (characterSlug: string, avatarUrl: string) => {
        set((state) => ({ optimisticAvatars: { ...state.optimisticAvatars, [characterSlug.toLowerCase()]: avatarUrl } }));
      },

      clearOptimisticAvatar: (characterSlug: string) => {
        set((state) => {
          const { [characterSlug.toLowerCase()]: _, ...rest } = state.optimisticAvatars;
          return { optimisticAvatars: rest };
        });
      },

      getOptimisticAvatar: (characterSlug: string) => {
        return get().optimisticAvatars[characterSlug.toLowerCase()];
      },
    }),
    { name: "avatar-generation" },
  ),
);
