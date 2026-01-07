import { useEffect } from "react";

import { dealWithAudiobookTracks as impl } from "@player/deal-with-audiobook-playback";
import { stopAllTracks } from "@player/audiobook-player";
import { getCurrentLocation } from "@player/helpers/paragraphsNavigation";
import useSplashHidden from "./useSplashHidden";

/* We keep a mutable ref so we can swap the implementation on HMR */
const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@player/deal-with-audiobook-playback", (mod) => {
    if (mod) implRef.current = mod.dealWithAudiobookTracks;
    console.info("[HMR] dealWithAudiobookTracks updated");
  });
}

const IS_PLAYING_AUDIO_BOOK_KEY = "isPlayingAudioBook";

export function useAudiobookTracks() {
  // Read the localStorage setting ONCE when the hook initializes.
  const isSplashHidden = useSplashHidden();

  useEffect(() => {
    if (isSplashHidden) {
      playAudiobook();
    }
  }, [isSplashHidden]);
}

export const playAudiobook = () => {
  const { currentChapter, currentParagraph } = getCurrentLocation();
  if (currentChapter === 1 && currentParagraph === 0) {
    console.log("JUN 5 starting audioobok", new Date().toISOString());
    implRef.current({ currentChapter, currentParagraph: 1 });
  } else {
    console.log("JUN 5 starting audioobok", new Date().toISOString());

    implRef.current({ currentChapter, currentParagraph });
  }
};

export const stopAudiobook = () => {
  localStorage.setItem(IS_PLAYING_AUDIO_BOOK_KEY, "false");
  stopAllTracks();
};

// Add TypeScript declarations for window properties
declare global {
  interface Window {
    playAudiobook: typeof playAudiobook;
    stopAudiobook: typeof stopAudiobook;
  }
}

window.playAudiobook = playAudiobook;
window.stopAudiobook = stopAudiobook;
