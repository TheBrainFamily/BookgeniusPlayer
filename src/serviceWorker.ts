// Service worker registration and handling

import { isMobileOrTablet } from "./utils/isMobileOrTablet";

const SW_TIMEOUT_MS = 10000;
const START_TIME = Date.now();

const ENABLE_LOGS = false;

const logWithTime = (message: string) => {
  if (!ENABLE_LOGS) return;
  const elapsedMs = Date.now() - START_TIME;
  console.log(`[SW ${elapsedMs}ms] ${message}`);
};

export const dealWithSW = () => {
  logWithTime("Initializing service worker");
  updateRightNotesVisibility();

  let serviceWorkerHandled = false;
  let swTimeoutId: number | undefined;

  const setServiceWorkerAsHandled = () => {
    if (!serviceWorkerHandled) {
      serviceWorkerHandled = true;
      logWithTime("Service Worker marked as handled");

      if (swTimeoutId) {
        clearTimeout(swTimeoutId);
      }
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

  logWithTime(`Service worker initialization completed: serviceWorkerHandled=${serviceWorkerHandled}`);
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
