import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface ContentShiftState {
  isContentShiftedLeft: boolean;

  enableContentShift: () => void;
  disableContentShift: () => void;
}

export const useContentShift = create<ContentShiftState>()(
  devtools(
    (set) => ({
      isContentShiftedLeft: false,

      enableContentShift: () => set({ isContentShiftedLeft: true }),
      disableContentShift: () => set({ isContentShiftedLeft: false }),
    }),
    { name: "content-shift" },
  ),
);
