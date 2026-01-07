import { useEffect } from "react";

import { useLocation } from "@player/state/LocationContext";
import { dealWithBackground as impl, updateBackgroundColors } from "@player/ui/background";
import { preloadBackgrounds } from "@player/preloadBackgrounds";
import useSplashHidden from "./useSplashHidden";
import { useIsAppReady } from "./useIsAppReady";
import { useNativeShell } from "@player/context/NativeShellContext";

const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@player/ui/background", (mod) => {
    if (mod) implRef.current = mod.dealWithBackground;
    console.info("[HMR] dealWithBackground updated");
  });
}

export function useBackgroundVideo() {
  const { location } = useLocation();
  const isSplashHidden = useSplashHidden();
  const isAppReady = useIsAppReady();
  const isNativeShell = useNativeShell();

  const { currentChapter, currentParagraph } = location;

  useEffect(() => {
    if (isNativeShell) {
      updateBackgroundColors({ currentChapter, currentParagraph });
    } else {
      implRef.current({ currentChapter, currentParagraph });
    }
  }, [currentChapter, currentParagraph, isNativeShell]);

  useEffect(() => {
    if (isNativeShell) return;
    if (!isSplashHidden || !isAppReady) return;
    preloadBackgrounds()
      .then(() => {
        console.log("Preloaded backgrounds");
      })
      .catch((error) => console.error("Failed to preload backgrounds:", error));
  }, [currentChapter, isSplashHidden, isAppReady, isNativeShell]);
}
