import { useEffect } from "react";

import { useLocation } from "@/state/LocationContext";
import { dealWithAudiobookTracks as impl } from "@/deal-with-audiobook-playback";
import { useDebounce } from "./useDebounce";
import { stopAllTracks } from "@/audiobook-player";
import { getCurrentLocation } from "@/helpers/paragraphsNavigation";

/* We keep a mutable ref so we can swap the implementation on HMR */
const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@/deal-with-audiobook-playback", (mod) => {
    implRef.current = mod.dealWithAudiobookTracks;
    console.info("[HMR] dealWithAudiobookTracks updated");
  });
}

let shouldPlayAudiobook = false;
export function useAudiobookTracks() {
  const { location } = useLocation();

  const { currentChapter, currentParagraph } = useDebounce(location, 300);

  useEffect(() => {
    if (shouldPlayAudiobook) {
      implRef.current({ currentChapter, currentParagraph });
    }
  }, [currentChapter, currentParagraph]);
}

window.playAudiobook = () => {
  shouldPlayAudiobook = true;
  const { currentChapter, currentParagraph } = getCurrentLocation();
  implRef.current({ currentChapter, currentParagraph });
};

window.stopAudiobook = () => {
  shouldPlayAudiobook = false;
  stopAllTracks();
};
