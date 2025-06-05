import { useEffect, useCallback, useRef } from "react";
import { useElementVisibilityStore } from "@/stores/elementVisibility.store";
import useSplashHidden from "./useSplashHidden";

const INACTIVITY_TIMEOUT = 8000;
const SCROLL_HIDE_DELAY = 3000;
const TOUCH_MOVE_THRESHOLD = 30;
const TAP_TIME_THRESHOLD = 500;

// Interactive element selectors that should be ignored for taps
const INTERACTIVE_SELECTORS = [
  "button",
  "input",
  "a",
  "[data-audio-player]",
  "[class*='AudioPlayer']",
  ".audio-player",
  ".volume-control",
  ".player-controls",
  "[data-interactive]",
  "[data-canonical-name]",
  "progress-indicator",
  ".modal-overlay",
  ".tooltip",
  ".character-highlighted-activated",
  ".inline-avatar",
  "[data-character]",
  ".character-placeholder",
  ".character-mention",
  ".character-highlighted",
  ".dialog-overlay",
];

export const useElementVisibility = () => {
  const areElementsVisible = useElementVisibilityStore((state) => state.areElementsVisible);
  const isScrollMode = useElementVisibilityStore((state) => state.isScrollMode);
  const touch = useElementVisibilityStore((state) => state.touch);

  const isSplashHidden = useSplashHidden();

  // Store actions (these don't change, so they won't cause re-renders)
  const { setInactivityTimer, setScrollTimer, showAllElements, hideAllElements, handleScrollStart, handleScrollEnd } = useElementVisibilityStore();

  const isInitializedRef = useRef(false);
  const inactivityTimerRef = useRef<number | null>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const scrollEndDebounceRef = useRef<number | null>(null);
  const isCurrentlyScrollingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  const stateRef = useRef({ areElementsVisible, isScrollMode, touch });

  useEffect(() => {
    stateRef.current = { areElementsVisible, isScrollMode, touch };
  }, [areElementsVisible, isScrollMode, touch]);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
      setInactivityTimer(null);
    }
  }, [setInactivityTimer]);

  const clearScrollTimer = useCallback(() => {
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
      setScrollTimer(null);
    }
  }, [setScrollTimer]);

  const cancelPendingRaf = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimer();

    const timerId = window.setTimeout(() => {
      hideAllElements();
      inactivityTimerRef.current = null;
      setInactivityTimer(null);
    }, INACTIVITY_TIMEOUT);

    inactivityTimerRef.current = timerId;
    setInactivityTimer(timerId);
  }, [clearInactivityTimer, hideAllElements, setInactivityTimer]);

  const handleScroll = useCallback(() => {
    if (scrollEndDebounceRef.current) {
      clearTimeout(scrollEndDebounceRef.current);
    }

    if (!isCurrentlyScrollingRef.current) {
      clearInactivityTimer();
      isCurrentlyScrollingRef.current = true;

      // Use requestAnimationFrame to update UI state only once per frame
      cancelPendingRaf();

      rafIdRef.current = requestAnimationFrame(() => {
        // Only update the store if we need to change the UI
        if (!stateRef.current.isScrollMode) {
          handleScrollStart();
        }
        rafIdRef.current = null;
      });
    }

    scrollEndDebounceRef.current = window.setTimeout(() => {
      isCurrentlyScrollingRef.current = false;
      scrollEndDebounceRef.current = null;

      cancelPendingRaf();

      rafIdRef.current = requestAnimationFrame(() => {
        handleScrollEnd();
        rafIdRef.current = null;
      });
    }, SCROLL_HIDE_DELAY);
  }, [clearInactivityTimer, cancelPendingRaf, handleScrollStart, handleScrollEnd]);

  useEffect(() => {
    if (isInitializedRef.current || !isSplashHidden) return;

    showAllElements();
    resetInactivityTimer();

    isInitializedRef.current = true;
  }, [showAllElements, resetInactivityTimer, isSplashHidden]);

  // Initialize after a delay even if splash screen detection fails
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isInitializedRef.current) {
        showAllElements();
        resetInactivityTimer();
        isInitializedRef.current = true;
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [showAllElements, resetInactivityTimer]);

  const stableHandleTap = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;

      // Check if tap is on an interactive element
      for (const selector of INTERACTIVE_SELECTORS) {
        if (target.closest(selector)) {
          console.log("Tap ignored - interactive element", selector);
          return;
        }
      }

      const { handleScreenTap } = useElementVisibilityStore.getState();
      handleScreenTap();

      const storeState = useElementVisibilityStore.getState();
      const areNowVisible = storeState.areElementsVisible && !storeState.isScrollMode;

      if (areNowVisible) {
        resetInactivityTimer();
      } else {
        clearInactivityTimer();
      }
    },
    [resetInactivityTimer, clearInactivityTimer],
  );

  const stableHandleTouchStart = useCallback((event: TouchEvent) => {
    const touch = event.touches[0];
    const { setTouchStart } = useElementVisibilityStore.getState();
    setTouchStart(touch.clientY, touch.clientX, Date.now());
  }, []);

  const stableHandleTouchMove = useCallback((event: TouchEvent) => {
    if (stateRef.current.touch.isScrolling) return;

    const touchEvent = event.touches[0];
    const currentTouch = stateRef.current.touch;
    const deltaY = Math.abs(touchEvent.clientY - currentTouch.startY);
    const deltaX = Math.abs(touchEvent.clientX - currentTouch.startX);

    if (deltaY > TOUCH_MOVE_THRESHOLD || deltaX > TOUCH_MOVE_THRESHOLD) {
      const { setTouchScrolling } = useElementVisibilityStore.getState();
      setTouchScrolling(true);
    }
  }, []);

  const stableHandleTouchEnd = useCallback(
    (event: TouchEvent) => {
      const currentTouch = stateRef.current.touch;
      const touchDuration = Date.now() - currentTouch.startTime;

      const { setTouchScrolling } = useElementVisibilityStore.getState();
      setTouchScrolling(false);

      // Check if this was a tap (not a scroll) and within time limits
      if (!currentTouch.isScrolling && touchDuration < TAP_TIME_THRESHOLD && touchDuration > 50) {
        stableHandleTap(event);
      }
    },
    [stableHandleTap],
  );

  const stableHandleScroll = useCallback(() => {
    handleScroll();
  }, [handleScroll]);

  useEffect(() => {
    if (!isInitializedRef.current) return;

    document.addEventListener("click", stableHandleTap, true);
    document.addEventListener("touchstart", stableHandleTouchStart, { passive: true });
    document.addEventListener("touchmove", stableHandleTouchMove, { passive: true });
    document.addEventListener("touchend", stableHandleTouchEnd, true);

    const contentContainer = document.getElementById("content-container");
    if (contentContainer) {
      contentContainer.addEventListener("scroll", stableHandleScroll, { passive: true });
    } else {
      window.addEventListener("scroll", stableHandleScroll, { passive: true });
    }

    return () => {
      document.removeEventListener("click", stableHandleTap, true);
      document.removeEventListener("touchstart", stableHandleTouchStart);
      document.removeEventListener("touchmove", stableHandleTouchMove);
      document.removeEventListener("touchend", stableHandleTouchEnd, true);

      const contentContainer = document.getElementById("content-container");
      if (contentContainer) {
        contentContainer.removeEventListener("scroll", stableHandleScroll);
      } else {
        window.removeEventListener("scroll", stableHandleScroll);
      }

      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      clearInactivityTimer();
      clearScrollTimer();
    };
  }, [isInitializedRef.current, stableHandleTap, stableHandleTouchStart, stableHandleTouchMove, stableHandleTouchEnd, stableHandleScroll, clearInactivityTimer, clearScrollTimer]);

  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
      if (scrollEndDebounceRef.current) {
        clearTimeout(scrollEndDebounceRef.current);
        scrollEndDebounceRef.current = null;
      }

      clearInactivityTimer();
      clearScrollTimer();
    };
  }, [clearInactivityTimer, clearScrollTimer]);

  return { areElementsVisible, isScrollMode };
};
