import { useState, useEffect } from "react";

/**
 * Custom hook to track whether the splash screen has been hidden.
 * Listens for a `splashHidden` event on window to update state.
 *
 * @returns {boolean} - true if splash screen is hidden, false otherwise.
 */
export default function useSplashHidden(): boolean {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    const handleSplashHidden = () => {
      setIsHidden(true);
    };

    window.addEventListener("splashHidden", handleSplashHidden);

    return () => {
      window.removeEventListener("splashHidden", handleSplashHidden);
    };
  }, [isHidden]);

  return isHidden;
}
