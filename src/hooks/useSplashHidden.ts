import { useState, useEffect } from "react";

/**
 * Custom hook to track whether the splash screen has been hidden.
 * Listens for a `splashHidden` event on window to update state.
 * Also persists state in sessionStorage to survive hot reloads.
 *
 * @returns {boolean} - true if splash screen is hidden, false otherwise.
 */
export default function useSplashHidden(): boolean {
  // Initialize state from sessionStorage if available, otherwise default to false
  const [isHidden, setIsHidden] = useState(() => {
    // Check if we're in a browser environment
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("splashHidden");
      return stored === "true";
    }
    return false;
  });

  useEffect(() => {
    // Event handler to set state to true when splashHidden event fires
    const handleSplashHidden = () => {
      setIsHidden(true);
      // Store in sessionStorage to persist across hot reloads
      sessionStorage.setItem("splashHidden", "true");
    };

    // Also check if we're already in a hidden state from sessionStorage
    if (isHidden) {
      sessionStorage.setItem("splashHidden", "true");
    }

    window.addEventListener("splashHidden", handleSplashHidden);

    return () => {
      window.removeEventListener("splashHidden", handleSplashHidden);
    };
  }, [isHidden]); // Add isHidden as a dependency to react to state changes

  return isHidden;
}
