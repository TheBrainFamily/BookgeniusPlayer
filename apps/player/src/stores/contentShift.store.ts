import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface ContentShiftState {
  /** Number of modals currently requesting content shift */
  shiftRequestCount: number;
  /** Derived: true when at least one modal needs content shift */
  isContentShiftedLeft: boolean;

  enableContentShift: () => void;
  disableContentShift: () => void;
}

export const useContentShift = create<ContentShiftState>()(
  devtools(
    (set) => ({
      shiftRequestCount: 0,
      isContentShiftedLeft: false,

      enableContentShift: () =>
        set((state) => ({
          shiftRequestCount: state.shiftRequestCount + 1,
          isContentShiftedLeft: true,
        })),
      disableContentShift: () =>
        set((state) => {
          const newCount = Math.max(0, state.shiftRequestCount - 1);
          return { shiftRequestCount: newCount, isContentShiftedLeft: newCount > 0 };
        }),
    }),
    { name: "content-shift" },
  ),
);
