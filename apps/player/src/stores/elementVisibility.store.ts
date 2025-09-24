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
  isTimersPausedSticky: boolean;
  touch: TouchState;
  timers: TimerState;
  // Internal timer refs (not exposed to components)
  internalTimers: { inactivityTimerRef: number | null; scrollTimerRef: number | null };
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
  pauseAllTimers: () => void;
  startAllTimers: () => void;
  setIsTimersPausedSticky: (sticky: boolean) => void;
  clearInactivityTimer: () => void;
  resetInactivityTimer: () => void;
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
      isTimersPausedSticky: false,
      touch: { startY: 0, startX: 0, startTime: 0, isScrolling: false },
      timers: { inactivityTimerId: null, scrollTimerId: null },
      internalTimers: { inactivityTimerRef: null, scrollTimerRef: null },

      // Simple actions
      setElementsVisible: (visible) => set({ areElementsVisible: visible }),
      setScrollMode: (scrollMode) => set({ isScrollMode: scrollMode }),
      setTouchStart: (y, x, time) => set((state) => ({ touch: { ...state.touch, startY: y, startX: x, startTime: time, isScrolling: false } })),
      setTouchScrolling: (scrolling) => set((state) => ({ touch: { ...state.touch, isScrolling: scrolling } })),
      setInactivityTimer: (timerId) => set((state) => ({ timers: { ...state.timers, inactivityTimerId: timerId } })),
      setScrollTimer: (timerId) => set((state) => ({ timers: { ...state.timers, scrollTimerId: timerId } })),

      // Timer management
      clearInactivityTimer: () => {
        const { internalTimers } = get();

        if (internalTimers.inactivityTimerRef) {
          clearTimeout(internalTimers.inactivityTimerRef);
          set((state) => ({ internalTimers: { ...state.internalTimers, inactivityTimerRef: null }, timers: { ...state.timers, inactivityTimerId: null } }));
        }
      },

      resetInactivityTimer: () => {
        const store = get();

        if (store.internalTimers.inactivityTimerRef) {
          clearTimeout(store.internalTimers.inactivityTimerRef);
        }

        const timerId = window.setTimeout(() => {
          const { hideAllElements } = useElementVisibilityStore.getState();
          hideAllElements("inactivity");
          set((state) => ({ internalTimers: { ...state.internalTimers, inactivityTimerRef: null }, timers: { ...state.timers, inactivityTimerId: null } }));
        }, INACTIVITY_TIMEOUT);

        set((state) => ({ internalTimers: { ...state.internalTimers, inactivityTimerRef: timerId }, timers: { ...state.timers, inactivityTimerId: timerId } }));
      },

      pauseAllTimers: () => {
        const { internalTimers } = get();

        if (internalTimers.inactivityTimerRef) {
          clearTimeout(internalTimers.inactivityTimerRef);
        }
        if (internalTimers.scrollTimerRef) {
          clearTimeout(internalTimers.scrollTimerRef);
        }

        set({ internalTimers: { inactivityTimerRef: null, scrollTimerRef: null }, timers: { inactivityTimerId: null, scrollTimerId: null } });
      },

      startAllTimers: () => {
        const { areElementsVisible, isScrollMode, resetInactivityTimer, isTimersPausedSticky } = get();

        if (isTimersPausedSticky) return;

        // Only start timer if elements are visible and not in scroll mode
        if (areElementsVisible && !isScrollMode) {
          resetInactivityTimer();
        }
      },

      setIsTimersPausedSticky: (sticky) => set({ isTimersPausedSticky: sticky }),

      // Complex actions
      showAllElements: () => set({ areElementsVisible: true, isScrollMode: false, lastHideReason: null }),

      hideAllElements: (reason = null) => set({ areElementsVisible: false, isScrollMode: false, lastHideReason: reason }),

      handleScreenTap: () => {
        const { areElementsVisible, isScrollMode, clearInactivityTimer } = get();

        clearInactivityTimer();

        // If we're in scroll mode or elements are hidden, show all elements and exit scroll mode
        if (isScrollMode || !areElementsVisible) {
          set({ areElementsVisible: true, isScrollMode: false, lastHideReason: null });
        } else {
          // If elements are visible and we're not in scroll mode, hide them
          set({ areElementsVisible: false, isScrollMode: false, lastHideReason: "tap" });
        }
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
