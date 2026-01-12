import { useCallback, useEffect, useRef, useState } from "react";
import { useLocationRange } from "@player/hooks/useLocationRange";
import { useBookConvex } from "@player/context/BookConvexContext";
import { getBookAssetUrl } from "@player/utils/assetUrls";
import { useNativeShell } from "@player/context/NativeShellContext";
import { usePlayerDOM } from "@player/context/PlayerDOMContext";

type TimeoutId = number | null;

const READY_STATE_CAN_PLAY = 3;

interface UseVideoReadinessOpts {
  videoTimeoutMs?: number; // fallback to force ready if desired (can disable)
  minSplashMs?: number; // minimum splash display
  postReadyDelayMs?: number; // delay after a video is ready before starting splash
}

interface UseImageReadinessOpts {
  imageTimeoutMs?: number; // timeout per image load (default 30000ms)
  maxConcurrentLoads?: number; // max concurrent image loads (default all at once)
}

/**
 * A video is considered "truly ready" when it begins playing
 * (playing event). We also accept canplay as a fallback signal
 * if playing doesn't fire promptly (e.g., autoplay restrictions),
 * but we prefer playing.
 *
 * We don't treat "no element found" as ready.
 * Overall videosReady = videoAReady || videoBReady.
 *
 * We only start the splash timer after a configurable post-ready delay.
 */
const useVideoReadiness = ({
  videoTimeoutMs = 30000,
  minSplashMs = 1500,
  postReadyDelayMs = 100,
}: UseVideoReadinessOpts = {}) => {
  const { bgVideoA, bgVideoB } = usePlayerDOM();
  const [videoAReady, setVideoAReady] = useState(false);
  const [videoBReady, setVideoBReady] = useState(false);
  const [postReadyDelayElapsed, setPostReadyDelayElapsed] = useState(false);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const [videoBackgroundReady, setVideoBackgroundReady] = useState(false);

  const videoTimeoutIdRef = useRef<TimeoutId>(null);
  const postReadyDelayTimeoutIdRef = useRef<TimeoutId>(null);
  const splashTimeoutIdRef = useRef<TimeoutId>(null);

  useEffect(() => {
    const onAPlaying = () => setVideoAReady(true);
    const onACanPlay = () => {
      // Only set if not already ready; prefer playing but accept canplay
      setVideoAReady((prev) => prev || true);
    };

    const onBPlaying = () => setVideoBReady(true);
    const onBCanPlay = () => {
      setVideoBReady((prev) => prev || true);
    };

    // Attach listeners only if element exists
    if (bgVideoA) {
      // If already in a state that implies playable soon, attach events and
      // also check current readyState/paused to possibly mark ready early.
      if (bgVideoA.readyState >= READY_STATE_CAN_PLAY && !bgVideoA.paused) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Checking video state on mount
        setVideoAReady(true);
      } else {
        bgVideoA.addEventListener("playing", onAPlaying);
        bgVideoA.addEventListener("canplay", onACanPlay);
      }
    }

    if (bgVideoB) {
      if (bgVideoB.readyState >= READY_STATE_CAN_PLAY && !bgVideoB.paused) {
        setVideoBReady(true);
      } else {
        bgVideoB.addEventListener("playing", onBPlaying);
        bgVideoB.addEventListener("canplay", onBCanPlay);
      }
    }

    // Optional fallback: after videoTimeoutMs, accept whichever can play
    // If you want to disable force-readiness, set videoTimeoutMs to 0 or undefined.
    if (videoTimeoutMs && videoTimeoutMs > 0) {
      videoTimeoutIdRef.current = window.setTimeout(() => {
        // If neither is ready by timeout, we can treat canplay as enough or force readiness.
        // Here we force readiness to avoid blocking forever.
        setVideoAReady((prev) => prev || !!bgVideoA);
        setVideoBReady((prev) => prev || !!bgVideoB);
      }, videoTimeoutMs);
    }

    return () => {
      if (videoTimeoutIdRef.current) clearTimeout(videoTimeoutIdRef.current);
      if (postReadyDelayTimeoutIdRef.current) clearTimeout(postReadyDelayTimeoutIdRef.current);
      if (splashTimeoutIdRef.current) clearTimeout(splashTimeoutIdRef.current);

      if (bgVideoA) {
        bgVideoA.removeEventListener("playing", onAPlaying);
        bgVideoA.removeEventListener("canplay", onACanPlay);
      }
      if (bgVideoB) {
        bgVideoB.removeEventListener("playing", onBPlaying);
        bgVideoB.removeEventListener("canplay", onBCanPlay);
      }
    };
  }, [bgVideoA, bgVideoB, videoTimeoutMs]);

  // When any one video becomes ready, start the post-ready delay once.
  useEffect(() => {
    const videosReady = videoAReady || videoBReady;
    if (!videosReady || postReadyDelayElapsed) return;

    if (!postReadyDelayTimeoutIdRef.current) {
      postReadyDelayTimeoutIdRef.current = window.setTimeout(() => {
        setPostReadyDelayElapsed(true);
      }, postReadyDelayMs);
    }
  }, [videoAReady, videoBReady, postReadyDelayElapsed, postReadyDelayMs]);

  // After post-ready delay, start the splash timer (once)
  useEffect(() => {
    if (!postReadyDelayElapsed || minSplashElapsed) return;

    if (!splashTimeoutIdRef.current) {
      splashTimeoutIdRef.current = window.setTimeout(() => {
        setMinSplashElapsed(true);
      }, minSplashMs);
    }
  }, [postReadyDelayElapsed, minSplashElapsed, minSplashMs]);

  // Final readiness gate
  useEffect(() => {
    const videosReady = videoAReady || videoBReady;
    if (videosReady && postReadyDelayElapsed && minSplashElapsed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Deriving final ready state
      setVideoBackgroundReady(true);
    }
  }, [videoAReady, videoBReady, postReadyDelayElapsed, minSplashElapsed]);

  return { videoBackgroundReady, setVideoBackgroundReady };
};

const useImageReadiness = ({
  imageTimeoutMs = 30000,
  charactersData,
}: UseImageReadinessOpts & {
  charactersData: ReturnType<typeof useBookConvex>["charactersData"];
}) => {
  const { bgImageA, bgImageB } = usePlayerDOM();
  const [imageBackgroundReady, setImageBackgroundReady] = useState(false);
  const allCharacters = charactersData;
  const timeoutIdsRef = useRef<Set<TimeoutId>>(new Set());

  const { locationRange } = useLocationRange();

  const { chapter } = locationRange;
  const loadImages = useCallback(async (): Promise<void> => {
    const chapterCharacters = allCharacters.filter((character) =>
      character.infoPerChapter.find((chapterInfo) => chapterInfo.chapter === chapter),
    );

    const imageUrls = chapterCharacters
      .filter((character) => character.media?.avatarUrl)
      .map((character) => getBookAssetUrl(character.media!.avatarUrl!))
      .filter((url): url is string => !!url);

    let failedCount = 0;

    await Promise.allSettled(
      imageUrls.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            let timeoutId: TimeoutId = null;

            const cleanup = () => {
              if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutIdsRef.current.delete(timeoutId);
              }
            };

            img.onload = () => {
              cleanup();
              console.log(`Loaded: ${url}`);
              resolve();
            };
            img.onerror = () => {
              cleanup();
              console.warn(`Failed to load: ${url}`);
              failedCount++;
              resolve();
            };

            timeoutId = window.setTimeout(() => {
              cleanup();
              console.warn(`Timeout loading: ${url}`);
              failedCount++;
              resolve();
            }, imageTimeoutMs);

            timeoutIdsRef.current.add(timeoutId);
            img.src = url;
          }),
      ),
    );

    if (failedCount > 0) {
      console.warn(`Failed to load ${failedCount} out of ${imageUrls.length} images`);
    }

    console.log("All images processing completed!");
  }, [allCharacters, chapter, imageTimeoutMs]);

  // Cleanup function to clear all pending timeouts
  useEffect(() => {
    const timeoutIds = timeoutIdsRef.current;
    return () => {
      timeoutIds.forEach((id) => {
        if (id) clearTimeout(id);
      });
      timeoutIds.clear();
    };
  }, []);

  useEffect(() => {
    const isBackgroundImageLoaded = (bgImage: HTMLElement | null): Promise<boolean> => {
      if (!bgImage || !bgImage.style.backgroundImage) return Promise.resolve(false);

      // Extract URL from backgroundImage style (remove url() wrapper and quotes)
      const backgroundImage = bgImage.style.backgroundImage;
      const urlMatch = backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (!urlMatch) return Promise.resolve(false);

      const imageUrl = urlMatch[1];

      return new Promise((resolve) => {
        const img = new Image();

        const timeoutId = window.setTimeout(() => resolve(false), imageTimeoutMs);
        timeoutIdsRef.current.add(timeoutId);

        img.onload = () => {
          clearTimeout(timeoutId);
          timeoutIdsRef.current.delete(timeoutId);
          resolve(true);
        };
        img.onerror = () => {
          clearTimeout(timeoutId);
          timeoutIdsRef.current.delete(timeoutId);
          resolve(false);
        };

        img.src = imageUrl;
      });
    };

    const checkImages = async () => {
      const [isALoaded, isBLoaded] = await Promise.all([
        isBackgroundImageLoaded(bgImageA),
        isBackgroundImageLoaded(bgImageB),
      ]);

      if (isALoaded || isBLoaded) {
        setImageBackgroundReady(true);
      }
    };

    void checkImages();
  }, [bgImageA, bgImageB, imageTimeoutMs]);

  return { loadImages, imageBackgroundReady };
};

export const useAppReady = () => {
  const { charactersData, backgroundsForBook } = useBookConvex();
  const isNativeShell = useNativeShell();
  const { videoBackgroundReady, setVideoBackgroundReady } = useVideoReadiness({
    videoTimeoutMs: 30000,
    minSplashMs: 100,
    postReadyDelayMs: 100,
  });
  const { loadImages, imageBackgroundReady } = useImageReadiness({
    imageTimeoutMs: 30000,
    charactersData,
  });

  useEffect(() => {
    if (backgroundsForBook.length === 0 || isNativeShell) {
      setVideoBackgroundReady(true);
    }
  }, [backgroundsForBook, isNativeShell, setVideoBackgroundReady]);

  useEffect(() => {
    if (!videoBackgroundReady && !imageBackgroundReady) return;

    void loadImages()
      .then(() => {
        console.log("BOOK LOADER App is ready, dispatching appReady event");
        window.dispatchEvent(new CustomEvent("appReady"));
      })
      .catch((error) => {
        console.error("Failed to load images:", error);
        window.dispatchEvent(new CustomEvent("appReady"));
      });
  }, [videoBackgroundReady, loadImages, imageBackgroundReady]);
};
