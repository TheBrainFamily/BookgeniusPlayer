// Service worker registration and handling

const VIDEO_TIMEOUT_MS = 5000;
const SW_TIMEOUT_MS = 7000;

export const dealWithSW = () => {
  const splash = document.getElementById("splash");
  const bgVideoA = document.getElementById("bg-video-a") as HTMLVideoElement | null;

  if (!splash) {
    console.error("Splash screen element 'splash' not found.");
    return;
  }

  let serviceWorkerHandled = false;
  let videoReady = false;
  let videoTimeoutId: number | undefined;
  let swTimeoutId: number | undefined;

  const tryHideSplash = () => {
    if (splash.classList.contains("splash--hide")) {
      return;
    }

    if (serviceWorkerHandled && videoReady) {
      splash.classList.add("splash--hide");

      if (videoTimeoutId) clearTimeout(videoTimeoutId);
      if (swTimeoutId) clearTimeout(swTimeoutId);
    }
  };

  if (bgVideoA) {
    const setVideoAsReady = () => {
      if (!videoReady) {
        videoReady = true;

        bgVideoA.removeEventListener("playing", handleVideoReadyEvent);
        bgVideoA.removeEventListener("canplay", handleVideoReadyEvent);

        if (videoTimeoutId) {
          clearTimeout(videoTimeoutId);
        }

        tryHideSplash();
      }
    };

    const handleVideoReadyEvent = () => {
      setVideoAsReady();
    };

    // Check if video is already playing or has enough data to play
    // HTMLMediaElement.HAVE_FUTURE_DATA (readyState 3) or HAVE_ENOUGH_DATA (readyState 4)
    if (!bgVideoA.paused || bgVideoA.readyState >= 3) {
      setVideoAsReady();
    } else {
      // Listen for events that indicate the video is ready to play
      bgVideoA.addEventListener("playing", handleVideoReadyEvent);
      bgVideoA.addEventListener("canplay", handleVideoReadyEvent);

      videoTimeoutId = window.setTimeout(() => {
        if (!videoReady) {
          console.warn(`Timeout (${VIDEO_TIMEOUT_MS}ms) waiting for background video 'bg-video-a'. Assuming ready.`);
          setVideoAsReady();
        }
      }, VIDEO_TIMEOUT_MS);
    }
  } else {
    console.warn("Background video 'bg-video-a' not found. Assuming video part is ready.");
    videoReady = true;
  }

  const setServiceWorkerAsHandled = () => {
    if (!serviceWorkerHandled) {
      serviceWorkerHandled = true;

      if (swTimeoutId) {
        clearTimeout(swTimeoutId);
      }

      tryHideSplash();
    }
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js", { type: "module" })
      .then((registration) => {
        console.log("Service Worker registered successfully with scope:", registration.scope);
        // We still wait for CACHE_COMPLETE message or timeout
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
        setServiceWorkerAsHandled(); // SW part handled due to failure
      });

    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "CACHE_COMPLETE") {
        console.log("Received CACHE_COMPLETE from Service Worker.");
        setServiceWorkerAsHandled(); // SW part handled due to message
      }
    });

    swTimeoutId = window.setTimeout(() => {
      if (!serviceWorkerHandled) {
        console.warn(`Timeout (${SW_TIMEOUT_MS}ms) waiting for SW CACHE_COMPLETE. Assuming SW part handled.`);
        setServiceWorkerAsHandled(); // SW part handled due to timeout
      }
    }, SW_TIMEOUT_MS);
  } else {
    console.log("Service Worker not supported. Assuming SW part handled.");
    setServiceWorkerAsHandled();
  }

  if (videoReady && serviceWorkerHandled) {
    tryHideSplash();
  }
};
