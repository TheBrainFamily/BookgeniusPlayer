import { useEffect } from "react";

import { useLocation } from "@/state/LocationContext";
import { dealWithBackground as impl } from "@/ui/background";

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
  }, [currentChapter, currentParagraph]);
}
