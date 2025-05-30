import { useEffect, useState, useRef } from "react";

const useVideoReadiness = (videoTimeoutMs = 5000) => {
  const [videoAReady, setVideoAReady] = useState(false);
  const [videoBReady, setVideoBReady] = useState(false);
  const [ready, setReady] = useState(false);

  const videoTimeoutIdRef = useRef<number | undefined>(undefined);
  const buttonTimeoutIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const bgVideoA = document.getElementById("bg-video-a") as HTMLVideoElement | null;
    const bgVideoB = document.getElementById("bg-video-b") as HTMLVideoElement | null;

    const handleVideoAReadyEvent = () => setVideoAReady(true);
    const handleVideoBReadyEvent = () => setVideoBReady(true);

    // Check if videos are already ready
    if (bgVideoA) {
      if (bgVideoA.readyState >= 3) {
        setVideoAReady(true);
      } else {
        bgVideoA.addEventListener("canplay", handleVideoAReadyEvent);
        bgVideoA.addEventListener("canplaythrough", handleVideoAReadyEvent);
        bgVideoA.addEventListener("playing", handleVideoAReadyEvent);
      }
    } else {
      // No video A found, consider it ready
      setVideoAReady(true);
    }

    // Setup video B readiness detection
    if (bgVideoB) {
      if (bgVideoB.readyState >= 3) {
        setVideoBReady(true);
      } else {
        bgVideoB.addEventListener("canplay", handleVideoBReadyEvent);
        bgVideoB.addEventListener("canplaythrough", handleVideoBReadyEvent);
        bgVideoB.addEventListener("playing", handleVideoBReadyEvent);
      }
    } else {
      // No video B found, consider it ready
      setVideoBReady(true);
    }

    // Fallback timeout to consider videos ready after a delay
    videoTimeoutIdRef.current = window.setTimeout(() => {
      console.log("Video readiness timeout reached, forcing ready state");
      setVideoAReady(true);
      setVideoBReady(true);
    }, videoTimeoutMs);

    // Show start button with a slight delay after videos are ready
    // This gives animations time to complete before the button appears
    const MIN_SPLASH_DISPLAY_TIME = 1500; // Show splash for at least 1.5s

    buttonTimeoutIdRef.current = window.setTimeout(() => {
      setReady(true);
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

  // Effect to show start button when videos are ready
  useEffect(() => {
    const videoReady = videoAReady || videoBReady;

    if (videoReady && !ready && buttonTimeoutIdRef.current) {
      // If videos are ready but we're still waiting on the minimum display time,
      // keep the timeout in place
      console.log("Videos ready, waiting for minimum display time");
    }
  }, [videoAReady, videoBReady, ready]);

  return { ready };
};

export const useAppReady = () => {
  const { ready } = useVideoReadiness(5000);

  useEffect(() => {
    if (!ready) return;

    window.dispatchEvent(new CustomEvent("appReady"));
  }, [ready]);
};
