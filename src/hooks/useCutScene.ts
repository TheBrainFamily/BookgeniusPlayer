import { useEffect } from "react";

import { useLocation } from "@/state/LocationContext";
import { dealWithCutScenes as impl } from "@/deal-with-cut-scenes";

/* We keep a mutable ref so we can swap the implementation on HMR */
const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@/deal-with-cut-scenes", (mod) => {
    implRef.current = mod.dealWithCutScenes;
    console.info("[HMR] dealWithCutScenes updated");
  });
}

export function useCutScene() {
  const { location } = useLocation();
  const { currentChapter, currentParagraph } = location;

  useEffect(() => {
    implRef.current({ currentChapter, currentParagraph });
  }, [currentChapter, currentParagraph]);
}
