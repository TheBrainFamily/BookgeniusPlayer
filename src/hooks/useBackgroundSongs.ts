import { useEffect } from "react";
import { useLocation } from "@/src/state/LocationContext";
import { dealWithBackgroundSongs as impl } from "@/src/deal-with-background-songs";
import { useDebounce } from "./useDebounce";

/* We keep a mutable ref so we can swap the implementation on HMR */
const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@/src/deal-with-background-songs", (mod) => {
    implRef.current = mod.dealWithBackgroundSongs;
    console.info("[HMR] dealWithBackgroundSongs updated");
  });
}

export function useBackgroundSongs() {
  const { location } = useLocation();

  const { chapter, paragraph, endChapter, endParagraph } = useDebounce(location, 300);

  useEffect(() => {
    implRef.current({ startChapter: location.chapter, startParagraph: location.paragraph, endChapter: location.endChapter, endParagraph: location.endParagraph });
  }, [chapter, paragraph, endChapter, endParagraph]);
}
