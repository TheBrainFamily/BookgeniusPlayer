import { create } from "zustand";
import { devtools } from "zustand/middleware";

const INACTIVITY_TIMEOUT = 8000;

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

type HideReason = "tap" | "inactivity" | null;

interface ElementVisibilityState {
  areElementsVisible: boolean;
  isScrollMode: boolean;
  lastHideReason: HideReason;
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
  hideAllElements: (reason?: HideReason) => void;
  handleScreenTap: () => void;
  handleScrollStart: () => void;
  handleScrollEnd: () => void;
  pauseAllTimers: () => void;
  startAllTimers: () => void;
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
      lastHideReason: null,
      touch: { startY: 0, startX: 0, startTime: 0, isScrolling: false },
      timers: { inactivityTimerId: null, scrollTimerId: null },

      // Simple actions
      setElementsVisible: (visible) => set({ areElementsVisible: visible }),
      setScrollMode: (scrollMode) => set({ isScrollMode: scrollMode }),
      setTouchStart: (y, x, time) => set((state) => ({ touch: { ...state.touch, startY: y, startX: x, startTime: time, isScrolling: false } })),
      setTouchScrolling: (scrolling) => set((state) => ({ touch: { ...state.touch, isScrolling: scrolling } })),
      setInactivityTimer: (timerId) => set((state) => ({ timers: { ...state.timers, inactivityTimerId: timerId } })),
      setScrollTimer: (timerId) => set((state) => ({ timers: { ...state.timers, scrollTimerId: timerId } })),

      pauseAllTimers: () => {
        const { timers } = get();

        if (timers.inactivityTimerId !== null) {
          clearTimeout(timers.inactivityTimerId);
        }
        if (timers.scrollTimerId !== null) {
          clearTimeout(timers.scrollTimerId);
        }

        set({ timers: { inactivityTimerId: null, scrollTimerId: null } });
      },

      startAllTimers: () => {
        const { timers } = get();

        if (timers.inactivityTimerId !== null) {
          clearTimeout(timers.inactivityTimerId);
        }
        if (timers.scrollTimerId !== null) {
          clearTimeout(timers.scrollTimerId);
        }

        // Start the inactivity timer to automatically hide elements after timeout
        const inactivityTimerId = window.setTimeout(() => {
          const { hideAllElements, setInactivityTimer } = useElementVisibilityStore.getState();
          hideAllElements("inactivity");
          setInactivityTimer(null);
        }, INACTIVITY_TIMEOUT);

        // Update the store with the new timer ID
        set({ timers: { inactivityTimerId, scrollTimerId: null } });
      },

      // Complex actions
      showAllElements: () => set({ areElementsVisible: true, isScrollMode: false, lastHideReason: null }),

      hideAllElements: (reason = null) => set({ areElementsVisible: false, isScrollMode: false, lastHideReason: reason }),

      handleScreenTap: () => {
        const { areElementsVisible, isScrollMode } = get();

        // If we're in scroll mode or elements are hidden, show all elements and exit scroll mode
        if (isScrollMode || !areElementsVisible) {
          set({ areElementsVisible: true, isScrollMode: false, lastHideReason: null });
        } else {
          // If elements are visible and we're not in scroll mode, hide them
          set({ areElementsVisible: false, isScrollMode: false, lastHideReason: "tap" });
        }
      },

      handleScrollStart: () => {
        set({ isScrollMode: true });
      },

      handleScrollEnd: () => {
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

export const useLastHideReason = () => useElementVisibilityStore((state) => state.lastHideReason);

export const useOptionalElementVisibilityWithReason = () => {
  const isVisible = useOptionalElementVisibility();
  const lastHideReason = useLastHideReason();
  return { isVisible, lastHideReason };
};

export const useProgressElementVisibility = () =>
  useElementVisibilityStore((state) => {
    // Progress elements should be visible when:
    // 1. User is actively scrolling (isScrollMode = true)
    // 2. Elements are generally visible (areElementsVisible = true) AND not in scroll mode
    return state.isScrollMode || (state.areElementsVisible && !state.isScrollMode);
  });
