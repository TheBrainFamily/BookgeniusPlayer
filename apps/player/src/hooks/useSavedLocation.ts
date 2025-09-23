import { getSavedLocation } from "@player/helpers/paragraphsNavigation";
import { useState, useEffect } from "react";
import { type Location } from "@player/state/LocationContext";

export const useSavedLocation = () => {
  const [savedLocation, setSavedLocation] = useState(() => getSavedLocation());

  // Update only when furthest location actually changes (event-driven)
  useEffect(() => {
    const handleUpdated = (e: Event) => {
      const ce = e as CustomEvent<Location>;
      const next = ce.detail ?? getSavedLocation();
      setSavedLocation((prev) => {
        if (!prev || !next) return next;
        if (prev.currentChapter === next.currentChapter && prev.currentParagraph === next.currentParagraph) {
          return prev; // nothing relevant changed
        }
        return next;
      });
    };

    const handleReset = () => setSavedLocation(getSavedLocation());

    window.addEventListener("furthestLocationUpdated", handleUpdated as EventListener);
    window.addEventListener("furthestLocationReset", handleReset);
    return () => {
      window.removeEventListener("furthestLocationUpdated", handleUpdated as EventListener);
      window.removeEventListener("furthestLocationReset", handleReset);
    };
  }, []);
  return { savedLocation };
};
