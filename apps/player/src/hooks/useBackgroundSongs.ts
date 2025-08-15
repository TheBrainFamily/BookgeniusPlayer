import { useEffect, useRef, useState } from "react";

import { dealWithBackgroundSongs as impl, preloadBackgroundTracks } from "@player/deal-with-background-songs";
import { useLocationRange } from "./useLocationRange";
import useSplashHidden from "./useSplashHidden";
import { useIsAppReady } from "./useIsAppReady";

/* We keep a mutable ref so we can swap the implementation on HMR */
const implRef = { current: impl };

if (import.meta.hot) {
  import.meta.hot.accept("@player/deal-with-background-songs", (mod) => {
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

  const [isInitialTrackLoaded, setIsInitialTrackLoaded] = useState(false);
  const isPreloadingInProgress = useRef(false);
  const lastPreloadedChapter = useRef<number | null>(null);

  const handleTrackFullyLoaded = () => {
    console.log("First track fully loaded - enabling preloading on chapter change.");
    setIsInitialTrackLoaded(true);
  };

  useEffect(() => {
    if (!isAppReady) return;

    window.addEventListener("trackFullyLoaded", handleTrackFullyLoaded, { once: true });

    return () => {
      window.removeEventListener("trackFullyLoaded", handleTrackFullyLoaded);
    };
  }, [isAppReady]);

  useEffect(() => {
    if (!isSplashHidden || !isAppReady) return;

    const handleBackgroundMusic = async () => {
      await implRef.current({ currentChapter, currentParagraph });

      if (isInitialTrackLoaded && !isPreloadingInProgress.current && currentChapter !== lastPreloadedChapter.current) {
        isPreloadingInProgress.current = true;
        console.log(`Preloading background tracks for chapter: ${currentChapter}`);
        preloadBackgroundTracks()
          .then(() => {
            lastPreloadedChapter.current = currentChapter;
          })
          .catch((error) => {
            console.error("Error preloading background tracks:", error);
          })
          .finally(() => {
            isPreloadingInProgress.current = false;
          });
      }
    };

    handleBackgroundMusic().catch((error) => {
      console.error("Error handling background music:", error);
    });
  }, [currentChapter, currentParagraph, isSplashHidden, isAppReady, isInitialTrackLoaded]);
}
