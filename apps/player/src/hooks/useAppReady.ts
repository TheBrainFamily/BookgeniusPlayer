import { useEffect, useRef, useState } from "react";

type TimeoutId = number | null;

const READY_STATE_CAN_PLAY = 3;

interface UseVideoReadinessOpts {
  videoTimeoutMs?: number; // fallback to force ready if desired (can disable)
  minSplashMs?: number; // minimum splash display
  postReadyDelayMs?: number; // delay after a video is ready before starting splash
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
const useVideoReadiness = ({ videoTimeoutMs = 30000, minSplashMs = 1500, postReadyDelayMs = 100 }: UseVideoReadinessOpts = {}) => {
  const [videoAReady, setVideoAReady] = useState(false);
  const [videoBReady, setVideoBReady] = useState(false);
  const [postReadyDelayElapsed, setPostReadyDelayElapsed] = useState(false);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const [ready, setReady] = useState(false);

  const videoTimeoutIdRef = useRef<TimeoutId>(null);
  const postReadyDelayTimeoutIdRef = useRef<TimeoutId>(null);
  const splashTimeoutIdRef = useRef<TimeoutId>(null);

  useEffect(() => {
    const bgVideoA = document.getElementById("bg-video-a") as HTMLVideoElement | null;
    const bgVideoB = document.getElementById("bg-video-b") as HTMLVideoElement | null;

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
  }, [videoTimeoutMs]);

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
      setReady(true);
    }
  }, [videoAReady, videoBReady, postReadyDelayElapsed, minSplashElapsed]);

  return { ready };
};

export const useAppReady = () => {
  const { ready } = useVideoReadiness({ videoTimeoutMs: 30000, minSplashMs: 1500, postReadyDelayMs: 100 });

  useEffect(() => {
    if (!ready) return;

    console.log("BOOK LOADER App is ready, dispatching appReady event");
    window.dispatchEvent(new CustomEvent("appReady"));
  }, [ready]);
};
