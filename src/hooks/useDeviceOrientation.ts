import { useState, useEffect } from "react";

// --- Helper Hook for Landscape Detection ---
const useDeviceOrientation = () => {
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const landscape = window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches;
      setIsLandscape(landscape);
    };

    checkOrientation();

    const mediaQueryList = window.matchMedia("(orientation: landscape) and (max-height: 500px)");

    mediaQueryList.addEventListener("change", checkOrientation);
    return () => mediaQueryList.removeEventListener("change", checkOrientation);
  }, []);
  return { isLandscape };
};

export default useDeviceOrientation;
