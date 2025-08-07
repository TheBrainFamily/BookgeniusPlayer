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
      console.log("[useVideoReadiness] Video A ready event fired");
      setVideoAReady(true);
    };
    const handleVideoBReadyEvent = () => {
      console.log("[useVideoReadiness] Video B ready event fired");
      setVideoBReady(true);
    };

    // Check if videos are already ready
    if (bgVideoA) {
      if (bgVideoA.readyState >= 3) {
        console.log("[useVideoReadiness] Video A already ready (readyState:", bgVideoA.readyState, ")");
        setVideoAReady(true);
      } else {
        console.log("[useVideoReadiness] Adding listeners for Video A");
        bgVideoA.addEventListener("canplay", handleVideoAReadyEvent);
        bgVideoA.addEventListener("canplaythrough", handleVideoAReadyEvent);
        bgVideoA.addEventListener("playing", handleVideoAReadyEvent);
      }
    } else {
      // No video A found, consider it ready
      console.log("[useVideoReadiness] No Video A found, considering it ready");
      setVideoAReady(true);
    }

    // Setup video B readiness detection
    if (bgVideoB) {
      if (bgVideoB.readyState >= 3) {
        console.log("[useVideoReadiness] Video B already ready (readyState:", bgVideoB.readyState, ")");
        setVideoBReady(true);
      } else {
        console.log("[useVideoReadiness] Adding listeners for Video B");
        bgVideoB.addEventListener("canplay", handleVideoBReadyEvent);
        bgVideoB.addEventListener("canplaythrough", handleVideoBReadyEvent);
        bgVideoB.addEventListener("playing", handleVideoBReadyEvent);
      }
    } else {
      // No video B found, consider it ready
      console.log("[useVideoReadiness] No Video B found, considering it ready");
      setVideoBReady(true);
    }

    // Fallback timeout to consider videos ready after a delay
    videoTimeoutIdRef.current = window.setTimeout(() => {
      console.log("[useVideoReadiness] Video readiness timeout reached, forcing ready state");
      setVideoAReady(true);
      setVideoBReady(true);
    }, videoTimeoutMs);

    // Show start button with a slight delay after videos are ready
    // This gives animations time to complete before the button appears
    const MIN_SPLASH_DISPLAY_TIME = 1500; // Show splash for at least 1.5s

    buttonTimeoutIdRef.current = window.setTimeout(() => {
      console.log("[useVideoReadiness] Minimum splash display time reached, setting ready=true");
      setReady(true);
    }, MIN_SPLASH_DISPLAY_TIME);

    return () => {
      if (videoTimeoutIdRef.current) {
        clearTimeout(videoTimeoutIdRef.current);
        console.log("[useVideoReadiness] Cleared video readiness timeout");
      }
      if (buttonTimeoutIdRef.current) {
        clearTimeout(buttonTimeoutIdRef.current);
        console.log("[useVideoReadiness] Cleared button timeout");
      }

      if (bgVideoA) {
        bgVideoA.removeEventListener("canplay", handleVideoAReadyEvent);
        bgVideoA.removeEventListener("canplaythrough", handleVideoAReadyEvent);
        bgVideoA.removeEventListener("playing", handleVideoAReadyEvent);
        console.log("[useVideoReadiness] Removed listeners for Video A");
      }

      if (bgVideoB) {
        bgVideoB.removeEventListener("canplay", handleVideoBReadyEvent);
        bgVideoB.removeEventListener("canplaythrough", handleVideoBReadyEvent);
        bgVideoB.removeEventListener("playing", handleVideoBReadyEvent);
        console.log("[useVideoReadiness] Removed listeners for Video B");
      }
    };
  }, [videoTimeoutMs]);

  // Effect to show start button when videos are ready
  useEffect(() => {
    const videoReady = videoAReady || videoBReady;

    console.log("[useVideoReadiness] videoAReady:", videoAReady, "videoBReady:", videoBReady, "ready:", ready);

    if (videoReady && !ready && buttonTimeoutIdRef.current) {
      // If videos are ready but we're still waiting on the minimum display time,
      // keep the timeout in place
      console.log("[useVideoReadiness] Videos ready, waiting for minimum display time");
    }
    if (videoReady && !ready && !buttonTimeoutIdRef.current) {
      console.log("[useVideoReadiness] Videos ready, but no button timeout in place");
    }
    if (videoReady && ready) {
      console.log("[useVideoReadiness] Videos ready and ready=true");
    }
  }, [videoAReady, videoBReady, ready]);

  return { ready };
};

export const useAppReady = () => {
  const { ready } = useVideoReadiness();

  useEffect(() => {
    console.log("[useAppReady] useAppReady effect fired, ready:", ready);
    if (!ready) return;

    console.log("[useAppReady] Dispatching appReady event");
    window.dispatchEvent(new CustomEvent("appReady"));
  }, [ready]);
};
