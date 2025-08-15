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
    console.log("PINGWING: 20 before loading background performance.now()", performance.now());
    implRef.current(location);
    console.log("PINGWING: 22 after loading background performance.now()", performance.now());

    const preloadStart = performance.now();
    preloadBackgrounds().then(() => {
      console.log("PINGWING: 26 Preload background performance.now()", performance.now(), performance.now() - preloadStart);
    });
  }, [currentChapter, currentParagraph]);
}
