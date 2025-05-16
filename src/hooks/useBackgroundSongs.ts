import { useEffect } from "react";

import { useLocation } from "@/state/LocationContext";
import { dealWithBackgroundSongs as impl } from "@/deal-with-background-songs";
import { useDebounce } from "./useDebounce";

/* We keep a mutable ref so we can swap the implementation on HMR */
const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@/deal-with-background-songs", (mod) => {
    implRef.current = mod.dealWithBackgroundSongs;
    console.info("[HMR] useBackgroundSongs updated");
  });
}

export function useBackgroundSongs() {
  const { location } = useLocation();

  const { currentChapter, currentParagraph } = useDebounce(location, 300);

  useEffect(() => {
    implRef.current({ currentChapter, currentParagraph });
  }, [currentChapter, currentParagraph]);
}
