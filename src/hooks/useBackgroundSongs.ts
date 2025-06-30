import { useEffect, useRef } from "react";

import { dealWithBackgroundSongs as impl, preloadBackgroundTracks } from "@/deal-with-background-songs";
import { useLocationRange } from "./useLocationRange";
import useSplashHidden from "./useSplashHidden";
import { useIsAppReady } from "./useIsAppReady";

/* We keep a mutable ref so we can swap the implementation on HMR */
const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@/deal-with-background-songs", (mod) => {
    implRef.current = mod.dealWithBackgroundSongs;
    console.info("[HMR] useBackgroundSongs updated");
  });
}

export function useBackgroundSongs() {
  const isSplashHidden = useSplashHidden();
  const isAppReady = useIsAppReady();

  const {
    debouncedLocation: { currentChapter, currentParagraph },
  } = useLocationRange(300);

  const preloadingRef = useRef<Promise<boolean> | null>(null);
  const isFirstMusicStartRef = useRef(true);

  // Start preloading tracks when app is ready
  useEffect(() => {
    if (!isAppReady || preloadingRef.current) return;

    console.log("App ready - starting background tracks preloading...");
    preloadingRef.current = preloadBackgroundTracks().catch((error) => {
      console.error("Error preloading background tracks:", error);
      return false;
    });
  }, [isAppReady]);

  // Start playing music when splash is hidden OR location changes
  useEffect(() => {
    if (!isSplashHidden) return;

    const handleBackgroundMusic = async () => {
      if (isFirstMusicStartRef.current && preloadingRef.current) {
        console.log("First music start - waiting for preloading to complete...");
        const preloadSuccess = await preloadingRef.current;
        console.log(`Preloading completed with success: ${preloadSuccess}`);
        isFirstMusicStartRef.current = false;
      }

      await implRef.current({ currentChapter, currentParagraph });
    };

    handleBackgroundMusic();
  }, [currentChapter, currentParagraph, isSplashHidden]);
}
