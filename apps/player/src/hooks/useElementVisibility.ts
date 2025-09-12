import { useEffect, useCallback, useRef } from "react";

import { useElementVisibilityStore } from "@player/stores/elementVisibility.store";
import useSplashHidden from "./useSplashHidden";

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
  ".opened-modal",
];

export const useElementVisibility = () => {
  const areElementsVisible = useElementVisibilityStore((state) => state.areElementsVisible);
  const isScrollMode = useElementVisibilityStore((state) => state.isScrollMode);
  const touch = useElementVisibilityStore((state) => state.touch);

  const isSplashHidden = useSplashHidden();

  // Store actions (these don't change, so they won't cause re-renders)
  const { showAllElements, clearInactivityTimer, resetInactivityTimer } = useElementVisibilityStore();

  const isInitializedRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const lastTapTimeRef = useRef(0);
  const preventClickRef = useRef(false);

  const stateRef = useRef({ areElementsVisible, isScrollMode, touch });

  useEffect(() => {
    stateRef.current = { areElementsVisible, isScrollMode, touch };
  }, [areElementsVisible, isScrollMode, touch]);

  useEffect(() => {
    if (isInitializedRef.current || !isSplashHidden) {
      return;
    }

    clearInactivityTimer();
    showAllElements();
    resetInactivityTimer();

    isInitializedRef.current = true;
  }, [isSplashHidden, showAllElements, resetInactivityTimer, clearInactivityTimer]);

  const stableHandleTap = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const now = Date.now();

      // Prevent duplicate taps within 200ms
      if (now - lastTapTimeRef.current < 200) {
        return;
      }
      lastTapTimeRef.current = now;

      const target = event.target as HTMLElement;

      // Check if tap is on an interactive element
      for (const selector of INTERACTIVE_SELECTORS) {
        if (target.closest(selector)) {
          return;
        }
      }

      // Check if tap is on a sentence element (ch#-p#-s# pattern)
      const sentenceElement = target.closest("span[id^='ch']");
      if (sentenceElement && /^ch\d+-p\d+-s\d+$/.test(sentenceElement.id)) {
        return;
      }

      // For touch events, prevent the subsequent click event
      if (event.type === "touchend") {
        preventClickRef.current = true;
        setTimeout(() => {
          preventClickRef.current = false;
        }, 300);
      }

      // For click events, check if we should prevent it due to recent touch
      if (event.type === "click" && preventClickRef.current) {
        return;
      }

      // Clear any existing timers to prevent conflicts
      clearInactivityTimer();

      const { handleScreenTap } = useElementVisibilityStore.getState();
      handleScreenTap();

      // Use a small delay to ensure state has updated before checking
      setTimeout(() => {
        const storeState = useElementVisibilityStore.getState();
        const areNowVisible = storeState.areElementsVisible && !storeState.isScrollMode;

        if (areNowVisible) {
          resetInactivityTimer();
        }
      }, 10);
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
      if (!currentTouch.isScrolling && touchDuration < TAP_TIME_THRESHOLD && touchDuration > 100) {
        event.preventDefault();
        stableHandleTap(event);
      }
    },
    [stableHandleTap],
  );

  useEffect(() => {
    if (!isInitializedRef.current) return;

    document.addEventListener("click", stableHandleTap, true);
    document.addEventListener("touchstart", stableHandleTouchStart, { passive: true });
    document.addEventListener("touchmove", stableHandleTouchMove, { passive: true });
    document.addEventListener("touchend", stableHandleTouchEnd, true);

    return () => {
      document.removeEventListener("click", stableHandleTap, true);
      document.removeEventListener("touchstart", stableHandleTouchStart);
      document.removeEventListener("touchmove", stableHandleTouchMove);
      document.removeEventListener("touchend", stableHandleTouchEnd, true);

      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      clearInactivityTimer();
    };
  }, [isInitializedRef.current, stableHandleTap, stableHandleTouchStart, stableHandleTouchMove, stableHandleTouchEnd, clearInactivityTimer]);

  return { areElementsVisible, isScrollMode };
};
