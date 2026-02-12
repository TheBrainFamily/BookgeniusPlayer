import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type GraphicsQualityLevel = "full" | "reduced" | "minimal" | "bright";

export type AnimationSpeed = 0 | 1 | 2;
export type BookBlurCategory = "standardbooks" | "nonStandardbooks";

interface GraphicsSettingsState {
  qualityLevel: GraphicsQualityLevel;
  backgroundBlur: number;
  backgroundBlurByCategory: Record<BookBlurCategory, number>;
  currentBlurCategory: BookBlurCategory;
  animationSpeed: AnimationSpeed;
  contentOpacity: number; // 0-100, controls gradient overlay opacity for image backgrounds
  videoContentOpacity: number; // 0-100, controls gradient overlay opacity for video backgrounds
  edgeFade: number; // 0-100, controls how far top/bottom edges fade (gradient + mask)
  zoomDuration: number; // seconds for one zoom in/out cycle

  setQualityLevel: (level: GraphicsQualityLevel) => void;
  setBackgroundBlur: (blur: number) => void;
  setAnimationSpeed: (speed: AnimationSpeed) => void;
  setContentOpacity: (opacity: number) => void;
  setVideoContentOpacity: (opacity: number) => void;
  setEdgeFade: (fade: number) => void;
  setZoomDuration: (duration: number) => void;
  syncBackgroundBlurForBookSlug: (bookSlug?: string | null) => void;
  resetToDefaults: () => void;
}

export const DEFAULT_BACKGROUND_BLUR = 3;
export const LIBRARY_STANDARD_BOOK_BACKGROUND_BLUR = 15;
export const DEFAULT_BACKGROUND_BLURS_BY_CATEGORY: Record<BookBlurCategory, number> = {
  standardbooks: LIBRARY_STANDARD_BOOK_BACKGROUND_BLUR,
  nonStandardbooks: DEFAULT_BACKGROUND_BLUR,
};

export function getBlurCategoryForBookSlug(bookSlug?: string | null): BookBlurCategory {
  if (!bookSlug) return "nonStandardbooks";
  return bookSlug.includes("_") ? "standardbooks" : "nonStandardbooks";
}

export function getDefaultBackgroundBlurForBookSlug(bookSlug?: string | null): number {
  return DEFAULT_BACKGROUND_BLURS_BY_CATEGORY[getBlurCategoryForBookSlug(bookSlug)];
}

const DEFAULT_STATE = {
  qualityLevel: "full" as GraphicsQualityLevel,
  backgroundBlur: DEFAULT_BACKGROUND_BLUR,
  backgroundBlurByCategory: { ...DEFAULT_BACKGROUND_BLURS_BY_CATEGORY },
  currentBlurCategory: "nonStandardbooks" as BookBlurCategory,
  animationSpeed: 1 as AnimationSpeed,
  contentOpacity: 90,
  videoContentOpacity: 70,
  edgeFade: 60,
  zoomDuration: 45,
};

export const useGraphicsSettings = create<GraphicsSettingsState>()(
  devtools(
    persist(
      (set) => ({
        ...DEFAULT_STATE,

        setQualityLevel: (level) => set({ qualityLevel: level }),

        setBackgroundBlur: (blur) =>
          set((state) => {
            const clampedBlur = Math.max(0, Math.min(20, blur));
            const backgroundBlurByCategory =
              state.backgroundBlurByCategory ?? DEFAULT_BACKGROUND_BLURS_BY_CATEGORY;
            return {
              backgroundBlur: clampedBlur,
              backgroundBlurByCategory: {
                ...backgroundBlurByCategory,
                [state.currentBlurCategory]: clampedBlur,
              },
            };
          }),

        setAnimationSpeed: (speed) => set({ animationSpeed: speed }),

        setContentOpacity: (opacity) =>
          set({ contentOpacity: Math.max(0, Math.min(100, opacity)) }),

        setVideoContentOpacity: (opacity) =>
          set({ videoContentOpacity: Math.max(0, Math.min(100, opacity)) }),

        setEdgeFade: (fade) => set({ edgeFade: Math.max(0, Math.min(100, fade)) }),

        setZoomDuration: (duration) => set({ zoomDuration: Math.max(10, Math.min(120, duration)) }),

        syncBackgroundBlurForBookSlug: (bookSlug) =>
          set((state) => {
            const nextCategory = getBlurCategoryForBookSlug(bookSlug);
            const backgroundBlurByCategory =
              state.backgroundBlurByCategory ?? DEFAULT_BACKGROUND_BLURS_BY_CATEGORY;
            const nextBackgroundBlur =
              backgroundBlurByCategory[nextCategory] ??
              DEFAULT_BACKGROUND_BLURS_BY_CATEGORY[nextCategory];

            if (
              state.currentBlurCategory === nextCategory &&
              state.backgroundBlur === nextBackgroundBlur
            ) {
              return state;
            }

            return { currentBlurCategory: nextCategory, backgroundBlur: nextBackgroundBlur };
          }),

        resetToDefaults: () => set(DEFAULT_STATE),
      }),
      { name: "graphics-settings" },
    ),
    { name: "graphics-settings" },
  ),
);
