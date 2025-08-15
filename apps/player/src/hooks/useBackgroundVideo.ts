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
  useEffect(() => {
    implRef.current(location);

    const preloadStart = performance.now();
    preloadBackgrounds().then(() => {
      console.log("Preloaded backgrounds, it took:", performance.now() - preloadStart);
    });
  }, [currentChapter, currentParagraph]);
}
