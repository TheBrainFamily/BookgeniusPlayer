import { useEffect } from "react";

import { useLocation } from "@/state/LocationContext";
import { dealWithBackground as impl } from "@/ui/background";
import { preloadBackgrounds } from "@/preloadBackgrounds";

const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@/ui/background", (mod) => {
    implRef.current = mod.dealWithBackground;
    console.info("[HMR] dealWithBackground updated");
  });
}

export function useBackgroundVideo() {
  const { location } = useLocation();

  const { currentChapter, currentParagraph } = location;
  // For handling the current background
  useEffect(() => {
    implRef.current(location);
  }, [currentChapter, currentParagraph]);

  // For preloading future backgrounds
  useEffect(() => {
    preloadBackgrounds()
      .then(() => {
        console.log("Preloaded backgrounds");
      })
      .catch((error) => console.error("Failed to preload backgrounds:", error));
  }, [currentChapter]);
}
