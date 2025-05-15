import { useEffect } from "react";

import { useLocation } from "@/state/LocationContext";
import { dealWithAudiobookTracks as impl } from "@/deal-with-audiobook-playback";
import { useDebounce } from "./useDebounce";

/* We keep a mutable ref so we can swap the implementation on HMR */
const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@/deal-with-audiobook-playback", (mod) => {
    implRef.current = mod.dealWithAudiobookTracks;
    console.info("[HMR] dealWithAudiobookTracks updated");
  });
}

export function useAudiobookTracks() {
  const { location } = useLocation();

  const { currentChapter, currentParagraph } = useDebounce(location, 300);

  useEffect(() => {
    // implRef.current({ currentChapter, currentParagraph });
  }, [currentChapter, currentParagraph]);
}
