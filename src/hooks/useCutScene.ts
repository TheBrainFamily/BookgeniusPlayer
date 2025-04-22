import { useEffect } from "react";
import { useLocation } from "@/src/state/LocationContext";
import { dealWithCutScenes as impl } from "@/src/deal-with-cut-scenes";

/* We keep a mutable ref so we can swap the implementation on HMR */
const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@/src/deal-with-cut-scenes", (mod) => {
    implRef.current = mod.dealWithCutScenes;
    console.info("[HMR] dealWithCutScenes updated");
  });
}

export function useCutScene() {
  const { location } = useLocation();

  useEffect(() => {
    implRef.current({ startChapter: location.chapter, startParagraph: location.paragraph });
  }, [location.chapter, location.paragraph]);
}
