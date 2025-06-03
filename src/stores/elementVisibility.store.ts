import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface TouchState {
  startY: number;
  startX: number;
  startTime: number;
  isScrolling: boolean;
}

interface TimerState {
  inactivityTimerId: number | null;
  scrollTimerId: number | null;
}

interface ElementVisibilityState {
  areElementsVisible: boolean;
  isScrollMode: boolean;
  touch: TouchState;
  timers: TimerState;
  // Actions
  setElementsVisible: (visible: boolean) => void;
  setScrollMode: (scrollMode: boolean) => void;
  setTouchStart: (y: number, x: number, time: number) => void;
  setTouchScrolling: (scrolling: boolean) => void;
  setInactivityTimer: (timerId: number | null) => void;
  setScrollTimer: (timerId: number | null) => void;
  // Complex actions
  showAllElements: () => void;
  hideAllElements: () => void;
  handleScreenTap: () => void;
  handleScrollStart: () => void;
  handleScrollEnd: () => void;
  // Selectors for better performance
  getVisibilityState: () => { areElementsVisible: boolean; isScrollMode: boolean };
  getTouchState: () => TouchState;
  getTimerState: () => TimerState;
}

export const useElementVisibilityStore = create<ElementVisibilityState>()(
  devtools(
    (set, get) => ({
      // Initial state
      areElementsVisible: true,
      isScrollMode: false,
      touch: { startY: 0, startX: 0, startTime: 0, isScrolling: false },
      timers: { inactivityTimerId: null, scrollTimerId: null },

      // Simple actions
      setElementsVisible: (visible) => set({ areElementsVisible: visible }),
      setScrollMode: (scrollMode) => set({ isScrollMode: scrollMode }),
      setTouchStart: (y, x, time) => set((state) => ({ touch: { ...state.touch, startY: y, startX: x, startTime: time, isScrolling: false } })),
      setTouchScrolling: (scrolling) => set((state) => ({ touch: { ...state.touch, isScrolling: scrolling } })),
      setInactivityTimer: (timerId) => set((state) => ({ timers: { ...state.timers, inactivityTimerId: timerId } })),
      setScrollTimer: (timerId) => set((state) => ({ timers: { ...state.timers, scrollTimerId: timerId } })),

      // Complex actions
      showAllElements: () => set({ areElementsVisible: true, isScrollMode: false }),

      hideAllElements: () => set({ areElementsVisible: false, isScrollMode: false }),

      handleScreenTap: () => {
        const { areElementsVisible, isScrollMode } = get();
        console.log("handleScreenTap - before:", { areElementsVisible, isScrollMode });

        // If we're in scroll mode or elements are hidden, show all elements and exit scroll mode
        if (isScrollMode || !areElementsVisible) {
          console.log("handleScreenTap - showing elements");
          set({ areElementsVisible: true, isScrollMode: false });
        } else {
          // If elements are visible and we're not in scroll mode, hide them
          console.log("handleScreenTap - hiding elements");
          set({ areElementsVisible: false, isScrollMode: false });
        }
      },

      handleScrollStart: () => {
        console.log("handleScrollStart - hiding elements");
        set({ isScrollMode: true });
      },

      handleScrollEnd: () => {
        console.log("handleScrollEnd - keeping visibility state, exiting scroll mode");
        // After scroll ends, exit scroll mode but keep elements in their previous visibility state
        // This allows elements to show up on tap if they were visible before scrolling
        set({ isScrollMode: false });
      },

      // Selectors for better performance
      getVisibilityState: () => {
        const { areElementsVisible, isScrollMode } = get();
        return { areElementsVisible, isScrollMode };
      },
      getTouchState: () => get().touch,
      getTimerState: () => get().timers,
    }),
    { name: "element-visibility" },
  ),
);

export const useOptionalElementVisibility = () => useElementVisibilityStore((state) => state.areElementsVisible);

export const useProgressElementVisibility = () =>
  useElementVisibilityStore((state) => {
    // Progress elements should be visible when:
    // 1. User is actively scrolling (isScrollMode = true)
    // 2. Elements are generally visible (areElementsVisible = true) AND not in scroll mode
    return state.isScrollMode || (state.areElementsVisible && !state.isScrollMode);
  });
