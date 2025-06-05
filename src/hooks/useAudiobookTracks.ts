import { useEffect } from "react";

import { dealWithAudiobookTracks as impl } from "@/deal-with-audiobook-playback";
import { stopAllTracks } from "@/audiobook-player";
import { getCurrentLocation } from "@/helpers/paragraphsNavigation";
import { useLocationRange } from "./useLocationRange";

/* We keep a mutable ref so we can swap the implementation on HMR */
const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@/deal-with-audiobook-playback", (mod) => {
    implRef.current = mod.dealWithAudiobookTracks;
    console.info("[HMR] dealWithAudiobookTracks updated");
  });
}

const IS_PLAYING_AUDIO_BOOK_KEY = "isPlayingAudioBook";

export function useAudiobookTracks() {
  // Read the localStorage setting ONCE when the hook initializes.
  const initialIsPlayingAudioBookSetting = localStorage.getItem(IS_PLAYING_AUDIO_BOOK_KEY);
  const {
    debouncedLocation: { currentChapter, currentParagraph },
  } = useLocationRange(300);

  useEffect(() => {
    // This effect runs on chapter/paragraph change. Only start audiobook playback
    // if the INITIAL setting from localStorage (when the component/hook was first set up)
    // was explicitly "true". This prevents it from starting if the user had it off.
    if (initialIsPlayingAudioBookSetting === "true") {
      implRef.current({ currentChapter, currentParagraph });
    }
  }, [currentChapter, currentParagraph, initialIsPlayingAudioBookSetting]); // Added initialIsPlayingAudioBookSetting to dependencies
}

export const playAudiobook = (getSavedState: boolean = false) => {
  const currentPlayStateFromStorage = localStorage.getItem(IS_PLAYING_AUDIO_BOOK_KEY);
  if (getSavedState) {
    // When called with getSavedState: true (e.g., on initial load via dealWithSW)
    // Only proceed if localStorage is EXPLICITLY "true".
    if (currentPlayStateFromStorage !== "true") {
      console.log(`PONTON playAudiobook (getSavedState=true): Not playing because localStorage is not "true". Value: "${currentPlayStateFromStorage}"`);
      return;
    }
    // If currentPlayStateFromStorage is "true", fall through to play.
    console.log('PONTON playAudiobook (getSavedState=true): Proceeding to play because localStorage is "true".');
  } else {
    // When called with getSavedState: false (e.g., user manually clicks play button)
    // Set localStorage to "true" and play.
    console.log('PONTON playAudiobook (getSavedState=false): User action, setting localStorage to "true" and playing.');
    localStorage.setItem(IS_PLAYING_AUDIO_BOOK_KEY, "true");
  }

  const { currentChapter, currentParagraph } = getCurrentLocation();
  implRef.current({ currentChapter, currentParagraph });
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
