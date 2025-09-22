import { useMemo } from "react";
import { useLocation } from "@player/state/LocationContext";
import { useDebounce } from "./useDebounce";

/**
 * Custom hook to provide a debounced and memoized location range object.
 * This hook efficiently handles location changes by debouncing updates and
 * memoizing the resulting range object to prevent unnecessary re-renders.
 *
 * @param delayMs - Debounce delay in milliseconds, defaults to 200ms
 * @returns A stable, memoized location range object
 */
export const useLocationRange = (delayMs = 200) => {
  const { location } = useLocation();
  const debouncedLocation = useDebounce(location, delayMs);

  const locationRange = useMemo(
    () => ({
      chapter: debouncedLocation.chapter,
      paragraph: debouncedLocation.paragraph,
      endChapter: debouncedLocation.endChapter,
      endParagraph: debouncedLocation.endParagraph,
      currentChapter: debouncedLocation.currentChapter,
      currentParagraph: debouncedLocation.currentParagraph,
      earliestVisibleParagraph: debouncedLocation.earliestVisibleParagraph,
      latestVisibleParagraph: debouncedLocation.latestVisibleParagraph,
      earliestVisibleChapter: debouncedLocation.earliestVisibleChapter,
      latestVisibleChapter: debouncedLocation.latestVisibleChapter,
    }),
    [
      debouncedLocation.chapter,
      debouncedLocation.paragraph,
      debouncedLocation.endChapter,
      debouncedLocation.endParagraph,
      debouncedLocation.currentChapter,
      debouncedLocation.currentParagraph,
      debouncedLocation.earliestVisibleParagraph,
      debouncedLocation.latestVisibleParagraph,
      debouncedLocation.earliestVisibleChapter,
      debouncedLocation.latestVisibleChapter,
    ],
  );

  return { locationRange, debouncedLocation };
};
