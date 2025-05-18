// Service worker registration and handling

import { initAudioContext } from "./audio-crossfader";
import { dealWithBackgroundSongs } from "./deal-with-background-songs";
import { getCurrentLocation } from "./helpers/paragraphsNavigation";
import { playAudiobook } from "./hooks/useAudiobookTracks";
import { isMobileOrTablet } from "./utils/isMobileOrTablet";

const VIDEO_TIMEOUT_MS = 5000;
const SW_TIMEOUT_MS = 10000;
const START_TIME = Date.now();

const ENABLE_SPLASH_LOGS = false;

const logWithTime = (message: string) => {
  if (!ENABLE_SPLASH_LOGS) return;
  const elapsedMs = Date.now() - START_TIME;
  console.log(`[SPLASH ${elapsedMs}ms] ${message}`);
};

export const dealWithSW = () => {
  logWithTime("Initializing splash screen handling");
  updateRightNotesVisibility();

  const splash = document.getElementById("splash");
  const bgVideoA = document.getElementById("bg-video-a") as HTMLVideoElement | null;
  const bgVideoB = document.getElementById("bg-video-b") as HTMLVideoElement | null;

  if (!splash) {
    console.error("Splash screen element 'splash' not found.");
    return;
  }

  let serviceWorkerHandled = false;
  let videoAReady = false;
  let videoBReady = false;
  let videoTimeoutId: number | undefined = undefined;
  let swTimeoutId: number | undefined;

  const videoReady = () => videoAReady || videoBReady;

  const tryHideSplash = () => {
    if (splash.classList.contains("splash--hide")) {
      return;
    }

    logWithTime(`Trying to hide splash: videoAReady=${videoAReady}, videoBReady=${videoBReady}`);

    if (videoReady()) {
      logWithTime("All conditions met, showing start button");
      if (videoTimeoutId) clearTimeout(videoTimeoutId);
      if (swTimeoutId) clearTimeout(swTimeoutId);

      // Create start button if it doesn't exist yet
      let startButton = document.getElementById("splash-start-button");
      if (!startButton) {
        startButton = document.createElement("button");
        startButton.id = "splash-start-button";
        startButton.innerText = "Start";

        startButton.addEventListener("click", async () => {
          startButton.remove();
          const result = await initAudioContext();
          console.log("initAudioContext", result);
          if (result) {
            dealWithBackgroundSongs({ currentChapter: 1, currentParagraph: 0 });
            console.log("dealWithBackgroundSongs after");
            splash.classList.add("splash--hide");
            window.dispatchEvent(new CustomEvent("splashHidden"));
            playAudiobook();
          } else {
            console.error("Failed to initialize audio context");
            // Still proceed with UI to ensure user isn't stuck
            splash.classList.add("splash--hide");
            window.dispatchEvent(new CustomEvent("splashHidden"));
          }
        });

        splash.appendChild(startButton);
      }
    }
  };

  if (bgVideoA) {
    logWithTime(`Background video A found: readyState=${bgVideoA.readyState}, paused=${bgVideoA.paused}, src=${bgVideoA.src || "none"}`);

    const setVideoAAsReady = () => {
      if (!videoAReady) {
        videoAReady = true;
        logWithTime("Video A marked as ready");

        bgVideoA.removeEventListener("playing", handleVideoAReadyEvent);
        bgVideoA.removeEventListener("canplay", handleVideoAReadyEvent);

        tryHideSplash();
      }
    };

    const handleVideoAReadyEvent = (event: Event) => {
      logWithTime(`Video A event received: ${event.type}`);
      setVideoAAsReady();
    };

    // Check if video is already playing or has enough data to play
    // HTMLMediaElement.HAVE_FUTURE_DATA (readyState 3) or HAVE_ENOUGH_DATA (readyState 4)
    if (!bgVideoA.paused || bgVideoA.readyState >= 3) {
      logWithTime(`Video A already ready: readyState=${bgVideoA.readyState}, paused=${bgVideoA.paused}`);
      setVideoAAsReady();
    } else {
      // Listen for events that indicate the video is ready to play
      logWithTime("Video A not ready, adding event listeners");
      bgVideoA.addEventListener("playing", handleVideoAReadyEvent);
      bgVideoA.addEventListener("canplay", handleVideoAReadyEvent);
    }
  } else {
    logWithTime("Background video 'bg-video-a' not found. Assuming video A is ready.");
    videoAReady = true;
  }

  if (bgVideoB) {
    logWithTime(`Background video B found: readyState=${bgVideoB.readyState}, paused=${bgVideoB.paused}, src=${bgVideoB.src || "none"}`);

    const setVideoBAsReady = () => {
      if (!videoBReady) {
        videoBReady = true;
        logWithTime("Video B marked as ready");

        bgVideoB.removeEventListener("playing", handleVideoBReadyEvent);
        bgVideoB.removeEventListener("canplay", handleVideoBReadyEvent);

        tryHideSplash();
      }
    };

    const handleVideoBReadyEvent = (event: Event) => {
      logWithTime(`Video B event received: ${event.type}`);
      setVideoBAsReady();
    };

    if (!bgVideoB.paused || bgVideoB.readyState >= 3) {
      logWithTime(`Video B already ready: readyState=${bgVideoB.readyState}, paused=${bgVideoB.paused}`);
      setVideoBAsReady();
    } else {
      logWithTime("Video B not ready, adding event listeners");
      bgVideoB.addEventListener("playing", handleVideoBReadyEvent);
      bgVideoB.addEventListener("canplay", handleVideoBReadyEvent);
    }
  } else {
    logWithTime("Background video 'bg-video-b' not found. Assuming video B is ready.");
    videoBReady = true;
  }

  videoTimeoutId = window.setTimeout(() => {
    if (!videoAReady || !videoBReady) {
      logWithTime(`Video timeout (${VIDEO_TIMEOUT_MS}ms) reached. Assuming all videos ready.`);
      videoAReady = true;
      videoBReady = true;
      tryHideSplash();
    }
  }, VIDEO_TIMEOUT_MS);

  const setServiceWorkerAsHandled = () => {
    if (!serviceWorkerHandled) {
      serviceWorkerHandled = true;
      logWithTime("Service Worker marked as handled");

      if (swTimeoutId) {
        clearTimeout(swTimeoutId);
      }

      tryHideSplash();
    }
  };

  if ("serviceWorker" in navigator) {
    logWithTime("Service Worker supported, starting registration");

    // Check if there's already an active service worker
    if (navigator.serviceWorker.controller) {
      logWithTime("Active Service Worker controller already exists");
    }

    navigator.serviceWorker
      .register("/sw.js", { type: "module" })
      .then((registration) => {
        logWithTime(`Service Worker registered successfully with scope: ${registration.scope}`);

        if (registration.active) {
          logWithTime(`Service Worker is active: ${registration.active.state}`);
        } else if (registration.installing) {
          logWithTime(`Service Worker is installing: ${registration.installing.state}`);
        } else if (registration.waiting) {
          logWithTime(`Service Worker is waiting: ${registration.waiting.state}`);
        }
      })
      .catch((error) => {
        logWithTime(`Service Worker registration failed: ${error.message}`);
        setServiceWorkerAsHandled();
      });

    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "CACHE_COMPLETE") {
        logWithTime("Received CACHE_COMPLETE from Service Worker");
        setServiceWorkerAsHandled();
      }
    });

    swTimeoutId = window.setTimeout(() => {
      if (!serviceWorkerHandled) {
        logWithTime(`Service Worker timeout (${SW_TIMEOUT_MS}ms) reached. Assuming handled.`);
        setServiceWorkerAsHandled();
      }
    }, SW_TIMEOUT_MS);
  } else {
    logWithTime("Service Worker not supported. Assuming SW part handled.");
    setServiceWorkerAsHandled();
  }

  logWithTime(`Initial state check: videoReady=${videoReady()}, serviceWorkerHandled=${serviceWorkerHandled}`);

  if (videoReady() && serviceWorkerHandled) {
    tryHideSplash();
  }
};

const updateRightNotesVisibility = (): void => {
  if (typeof window === "undefined") return;

  const rightNotesElement = document.getElementById("right-notes");
  if (!rightNotesElement) {
    console.warn("Element with id 'right-notes' not found");
    return;
  }

  if (isMobileOrTablet()) {
    rightNotesElement.classList.add("hide");
  } else {
    rightNotesElement.classList.remove("hide");
  }

  const handleResize = () => {
    if (isMobileOrTablet()) {
      rightNotesElement.classList.add("hide");
    } else {
      rightNotesElement.classList.remove("hide");
    }
  };

  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);
};
