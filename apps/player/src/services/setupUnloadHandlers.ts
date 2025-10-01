import { readingPositionTracker } from "./readingPositionTracker";

/**
 * Setup handlers to flush reading position on page unload
 * Uses visibilitychange (primary), pagehide (iOS/Safari), and beforeunload (fallback)
 */
export const setupUnloadHandlers = (): (() => void) => {
  // Primary: visibilitychange (works on tab switch and navigation)
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      readingPositionTracker.flush();
    }
  };

  // iOS/Safari: pagehide (more reliable than beforeunload on iOS)
  const handlePageHide = () => {
    readingPositionTracker.flush();
  };

  // Fallback: beforeunload (least reliable, but covers some edge cases)
  const handleBeforeUnload = () => {
    readingPositionTracker.flush();
  };

  // Add listeners
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("beforeunload", handleBeforeUnload);

  // Cleanup function (if needed for unmount scenarios)
  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("beforeunload", handleBeforeUnload);
  };
};
