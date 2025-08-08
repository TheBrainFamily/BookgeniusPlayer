import { useEffect, useRef, useState } from "react";

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

  const [isInitialTrackLoaded, setIsInitialTrackLoaded] = useState(false);
  const isPreloadingInProgress = useRef(false);

  useEffect(() => {
useEffect(() => {
  if (!isAppReady) return;

  const handleTrackFullyLoaded = () => {
    console.log("First track fully loaded - enabling preloading on chapter change.");
    setIsInitialTrackLoaded(true);
  };

  window.addEventListener("trackFullyLoaded", handleTrackFullyLoaded, { once: true });

  return () => {
    window.removeEventListener("trackFullyLoaded", handleTrackFullyLoaded);
  };
}, [isAppReady]);
    window.addEventListener("trackFullyLoaded", handleTrackFullyLoaded);

    return () => {
      window.removeEventListener("trackFullyLoaded", handleTrackFullyLoaded);
    };
  }, [isAppReady]);

  useEffect(() => {
    if (!isSplashHidden || !isAppReady) return;

    const handleBackgroundMusic = async () => {
      await implRef.current({ currentChapter, currentParagraph });

      if (isInitialTrackLoaded && !isPreloadingInProgress.current) {
        isPreloadingInProgress.current = true;
        console.log("Preloading background tracks for the new chapter...");
        preloadBackgroundTracks()
          .catch((error) => {
            console.error("Error preloading background tracks:", error);
          })
          .finally(() => {
            isPreloadingInProgress.current = false;
          });
      }
    };

    handleBackgroundMusic();
  }, [currentChapter, currentParagraph, isSplashHidden, isAppReady, isInitialTrackLoaded]);
}
