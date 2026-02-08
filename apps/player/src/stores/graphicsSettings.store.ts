import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type GraphicsQualityLevel = "full" | "reduced" | "minimal" | "bright";

export type AnimationSpeed = 0 | 1 | 2;

interface GraphicsSettingsState {
  qualityLevel: GraphicsQualityLevel;
  backgroundBlur: number;
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
  resetToDefaults: () => void;
}

const DEFAULT_STATE = {
  qualityLevel: "full" as GraphicsQualityLevel,
  backgroundBlur: 3,
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

        setBackgroundBlur: (blur) => set({ backgroundBlur: Math.max(0, Math.min(20, blur)) }),

        setAnimationSpeed: (speed) => set({ animationSpeed: speed }),

        setContentOpacity: (opacity) =>
          set({ contentOpacity: Math.max(0, Math.min(100, opacity)) }),

        setVideoContentOpacity: (opacity) =>
          set({ videoContentOpacity: Math.max(0, Math.min(100, opacity)) }),

        setEdgeFade: (fade) => set({ edgeFade: Math.max(0, Math.min(100, fade)) }),

        setZoomDuration: (duration) => set({ zoomDuration: Math.max(10, Math.min(120, duration)) }),

        resetToDefaults: () => set(DEFAULT_STATE),
      }),
      { name: "graphics-settings" },
    ),
    { name: "graphics-settings" },
  ),
);
