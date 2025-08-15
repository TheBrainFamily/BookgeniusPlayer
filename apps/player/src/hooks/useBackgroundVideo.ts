import { useEffect } from "react";

import { useLocation } from "@player/state/LocationContext";
import { dealWithBackground as impl } from "@player/ui/background";

const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@player/ui/background", (mod) => {
    implRef.current = mod.dealWithBackground;
    console.info("[HMR] dealWithBackground updated");
  });
}

export function useBackgroundVideo() {
  const { location } = useLocation();

  const { currentChapter, currentParagraph } = location;
  useEffect(() => {
    implRef.current(location);
  }, [currentChapter, currentParagraph]);
}
