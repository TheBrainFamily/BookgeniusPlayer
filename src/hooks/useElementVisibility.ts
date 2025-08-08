import { useEffect, useCallback, useRef } from "react";
import { useElementVisibilityStore } from "@/stores/elementVisibility.store";
import useSplashHidden from "./useSplashHidden";

import { useLocation } from "@/state/LocationContext";
import { getCurrentLocation } from "@/helpers/paragraphsNavigation";

const SCROLL_HIDE_DELAY = 3000;
const SCROLL_DEBOUNCE_DELAY = 25;
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
  const { showAllElements, handleScrollStart, handleScrollEnd, clearInactivityTimer, resetInactivityTimer } = useElementVisibilityStore();

  const isInitializedRef = useRef(false);
  const scrollEndDebounceRef = useRef<number | null>(null);
  const isCurrentlyScrollingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const lastTapTimeRef = useRef(0);
  const preventClickRef = useRef(false);
  const { setLocation } = useLocation();

  const stateRef = useRef({ areElementsVisible, isScrollMode, touch });

  useEffect(() => {
    stateRef.current = { areElementsVisible, isScrollMode, touch };
  }, [areElementsVisible, isScrollMode, touch]);

  const cancelPendingRaf = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const handleScrollEndForUpdatingPosition = useCallback(() => {
    try {
      const currentLocation = getCurrentLocation();
      if (currentLocation) {
        // we need to update the lastScrollTimestamp to the current time to avoid the progress bar from jumping
        setLocation({ ...currentLocation, lastScrollTimestamp: Date.now() });
      }
    } catch (error) {
      console.warn("Failed to update paragraph progress:", error);
    }
  }, [setLocation]);

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
        // After scroll ends, restart the inactivity timer if elements are visible
        const currentState = useElementVisibilityStore.getState();
        if (currentState.areElementsVisible && !currentState.isScrollMode) {
          resetInactivityTimer();
        }
        rafIdRef.current = null;
      });
    }, SCROLL_HIDE_DELAY);
  }, [clearInactivityTimer, cancelPendingRaf, handleScrollStart, handleScrollEnd, resetInactivityTimer]);

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

  const scrollDebounceRef = useRef<number | null>(null);
  const stableHandleScroll = useCallback(() => {
    handleScroll();

    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current);
    }
    scrollDebounceRef.current = window.setTimeout(() => {
      handleScrollEndForUpdatingPosition();
    }, SCROLL_DEBOUNCE_DELAY);
  }, [handleScroll, handleScrollEndForUpdatingPosition]);

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
    };
  }, [isInitializedRef.current, stableHandleTap, stableHandleTouchStart, stableHandleTouchMove, stableHandleTouchEnd, stableHandleScroll, clearInactivityTimer]);

  useEffect(() => {
    return () => {
      if (scrollEndDebounceRef.current) {
        clearTimeout(scrollEndDebounceRef.current);
        scrollEndDebounceRef.current = null;
      }

      clearInactivityTimer();
    };
  }, [clearInactivityTimer]);

  return { areElementsVisible, isScrollMode };
};
