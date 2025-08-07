import { useEffect, useState, useRef } from "react";

const useVideoReadiness = (videoTimeoutMs = 30000) => {
  const [videoAReady, setVideoAReady] = useState(false);
  const [videoBReady, setVideoBReady] = useState(false);
  const [ready, setReady] = useState(false);

  const videoTimeoutIdRef = useRef<number | undefined>(undefined);
  const buttonTimeoutIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const bgVideoA = document.getElementById("bg-video-a") as HTMLVideoElement | null;
    const bgVideoB = document.getElementById("bg-video-b") as HTMLVideoElement | null;

    const handleVideoAReadyEvent = () => {
      if (!videoAReady) {
        console.log("[READY] bg-video-a is ready");
        setVideoAReady(true);
      }
    };
    const handleVideoBReadyEvent = () => {
      if (!videoBReady) {
        console.log("[READY] bg-video-b is ready");
        setVideoBReady(true);
      }
    };

    // If the video element exists AND has a source, wait for it to be ready.
    if (bgVideoA && (bgVideoA.currentSrc || bgVideoA.src)) {
      if (bgVideoA.readyState >= 3) {
        console.log("[READY] bg-video-a already ready (readyState >= 3)");
        setVideoAReady(true);
      } else {
        console.log("[READY] bg-video-a waiting for canplay/canplaythrough/playing");
        bgVideoA.addEventListener("canplay", handleVideoAReadyEvent);
        bgVideoA.addEventListener("canplaythrough", handleVideoAReadyEvent);
        bgVideoA.addEventListener("playing", handleVideoAReadyEvent);
      }
    }

    // If the video element exists AND has a source, wait for it to be ready.
    if (bgVideoB && (bgVideoB.currentSrc || bgVideoB.src)) {
      if (bgVideoB.readyState >= 3) {
        console.log("[READY] bg-video-b already ready (readyState >= 3)");
        setVideoBReady(true);
      } else {
        console.log("[READY] bg-video-b waiting for canplay/canplaythrough/playing");
        bgVideoB.addEventListener("canplay", handleVideoBReadyEvent);
        bgVideoB.addEventListener("canplaythrough", handleVideoBReadyEvent);
        bgVideoB.addEventListener("playing", handleVideoBReadyEvent);
      }
    }

    // Fallback timeout to consider videos ready after a delay.
    videoTimeoutIdRef.current = window.setTimeout(() => {
      console.log("[READY] Video readiness timeout reached, forcing ready state for all.");
      setVideoAReady(true);
      setVideoBReady(true);
    }, videoTimeoutMs);

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
    if ((videoAReady || videoBReady) && !ready) {
      console.log("[READY] Either bg-video-a or bg-video-b is ready. Setting ready=true.");
      setReady(true);
    }
  }, [videoAReady, videoBReady, ready]);

  return { ready };
};

export const useAppReady = () => {
  const { ready } = useVideoReadiness();

  useEffect(() => {
    if (!ready) {
      console.log("[READY] useAppReady: not ready yet");
      return;
    }

    console.log("[READY] useAppReady: dispatching appReady event");
    window.dispatchEvent(new CustomEvent("appReady"));
  }, [ready]);
};
