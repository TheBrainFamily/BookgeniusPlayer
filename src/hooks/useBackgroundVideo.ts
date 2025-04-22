import { useEffect } from "react";
import { useLocation } from "@/src/state/LocationContext";
import { dealWithBackground as impl } from "@/src/ui/background";
import { useDebounce } from "@/src/hooks/useDebounce";

const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@/src/ui/background", (mod) => {
    implRef.current = mod.dealWithBackground;
    console.info("[HMR] dealWithBackground updated");
  });
}

export function useBackgroundVideo() {
  const { location } = useLocation();
  const debouncedLocation = useDebounce(location, 300);

  useEffect(() => {
    const { chapter, paragraph, endChapter, endParagraph } = debouncedLocation;
    implRef.current({ startChapter: chapter, startParagraph: paragraph, endChapter, endParagraph });
  }, [debouncedLocation]);
}
