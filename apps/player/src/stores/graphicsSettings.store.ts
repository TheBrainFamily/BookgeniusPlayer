import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type GraphicsQualityLevel = "full" | "reduced" | "minimal" | "bright";

export type AnimationSpeed = 0 | 1 | 2;

interface GraphicsSettingsState {
  qualityLevel: GraphicsQualityLevel;
  backgroundBlur: number;
  animationSpeed: AnimationSpeed;

  setQualityLevel: (level: GraphicsQualityLevel) => void;
  setBackgroundBlur: (blur: number) => void;
  setAnimationSpeed: (speed: AnimationSpeed) => void;
  resetToDefaults: () => void;
}

const DEFAULT_STATE = { qualityLevel: "full" as GraphicsQualityLevel, backgroundBlur: 3, animationSpeed: 1 as AnimationSpeed };

export const useGraphicsSettings = create<GraphicsSettingsState>()(
  devtools(
    persist(
      (set) => ({
        ...DEFAULT_STATE,

        setQualityLevel: (level) => set({ qualityLevel: level }),

        setBackgroundBlur: (blur) => set({ backgroundBlur: Math.max(0, Math.min(20, blur)) }),

        setAnimationSpeed: (speed) => set({ animationSpeed: speed }),

        resetToDefaults: () => set(DEFAULT_STATE),
      }),
      { name: "graphics-settings" },
    ),
    { name: "graphics-settings" },
  ),
);
