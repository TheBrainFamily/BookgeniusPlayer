import { useEffect, useRef } from "react";
import { useLocation } from "@/src/state/LocationContext";
import { dealWithBackground as impl } from "@/src/ui/background";

const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@/src/ui/background", (mod) => {
    implRef.current = mod.dealWithBackground;
    console.info("[HMR] dealWithBackground updated");
  });
}

export function useBackgroundVideo() {
  const { location } = useLocation();

  /* For backgrounds we need the *visible range* (start & end paragraph).
     While we haven’t migrated page‑observer completely we just re‑use the
     same paragraph twice – exactly what the old cut‑scene test did.       */
  useEffect(() => {
    const { chapter, paragraph } = location;
    implRef.current({ startChapter: chapter, startParagraph: paragraph, endChapter: chapter, endParagraph: paragraph });
  }, [location.chapter, location.paragraph]);
}
