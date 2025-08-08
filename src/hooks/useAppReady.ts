import { useEffect, useState, useRef } from "react";

const useVideoReadiness = (videoTimeoutMs = 5000) => {
  const [videoAReady, setVideoAReady] = useState(false);
  const [videoBReady, setVideoBReady] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [ready, setReady] = useState(false);

  const videoTimeoutIdRef = useRef<number | undefined>(undefined);
  const buttonTimeoutIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const bgVideoA = document.getElementById("bg-video-a") as HTMLVideoElement | null;
    const bgVideoB = document.getElementById("bg-video-b") as HTMLVideoElement | null;

    const handleVideoAReadyEvent = () => setVideoAReady(true);
    const handleVideoBReadyEvent = () => setVideoBReady(true);

    // If the video element exists AND has a source, wait for it to be ready.
    if (bgVideoA && (bgVideoA.currentSrc || bgVideoA.src)) {
      if (bgVideoA.readyState >= 3) {
        setVideoAReady(true);
      } else {
        bgVideoA.addEventListener("canplay", handleVideoAReadyEvent);
        bgVideoA.addEventListener("canplaythrough", handleVideoAReadyEvent);
        bgVideoA.addEventListener("playing", handleVideoAReadyEvent);
      }
    } else {
      // If video A doesn't exist or has no src, consider it ready.
      setVideoAReady(true);
    }

    // If the video element exists AND has a source, wait for it to be ready.
    if (bgVideoB && (bgVideoB.currentSrc || bgVideoB.src)) {
      if (bgVideoB.readyState >= 3) {
        setVideoBReady(true);
      } else {
        bgVideoB.addEventListener("canplay", handleVideoBReadyEvent);
        bgVideoB.addEventListener("canplaythrough", handleVideoBReadyEvent);
        bgVideoB.addEventListener("playing", handleVideoBReadyEvent);
      }
    } else {
      // If video B doesn't exist or has no src, consider it ready.
      setVideoBReady(true);
    }

    // Fallback timeout to consider videos ready after a delay.
    videoTimeoutIdRef.current = window.setTimeout(() => {
      console.log("Video readiness timeout reached, forcing ready state for all.");
      setVideoAReady(true);
      setVideoBReady(true);
    }, videoTimeoutMs);

    // This timeout ensures the splash screen is visible for a minimum amount of time.
    const MIN_SPLASH_DISPLAY_TIME = 1500;
    buttonTimeoutIdRef.current = window.setTimeout(() => {
      setMinTimeElapsed(true);
    }, MIN_SPLASH_DISPLAY_TIME);

    return () => {
      if (videoTimeoutIdRef.current) clearTimeout(videoTimeoutIdRef.current);
      if (buttonTimeoutIdRef.current) clearTimeout(buttonTimeoutIdRef.current);

      if (bgVideoA) {
        bgVideoA.removeEventListener("canplay", handleVideoAReadyEvent);
        bgVideoA.removeEventListener("canplaythrough", handleVideoAReadyEvent);
        bgVideoA.removeEventListener("playing", handleVideoAReadyEvent);
      }
      if (bgVideoB) {
        bgVideoB.removeEventListener("canplay", handleVideoBReadyEvent);
        bgVideoB.removeEventListener("canplaythrough", handleVideoBReadyEvent);
        bgVideoB.removeEventListener("playing", handleVideoBReadyEvent);
      }
    };
  }, [videoTimeoutMs]);

  useEffect(() => {
    if (videoAReady && videoBReady && minTimeElapsed && !ready) {
      setReady(true);
    }
  }, [videoAReady, videoBReady, minTimeElapsed, ready]);

  return { ready };
};

export const useAppReady = () => {
  const { ready } = useVideoReadiness();

  useEffect(() => {
    if (!ready) return;

    window.dispatchEvent(new CustomEvent("appReady"));
  }, [ready]);
};
