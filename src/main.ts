/*  THIS FILE IS 100% VANILLA JS ‑ NOTHING RENDERS HERE
 *
 *  We simply copied everything that used to live in main.ts,
 *  removed the `startReactComponents()` call (React is now started
 *  from index.tsx) and wrapped the whole thing into `runLegacyInit()`.
 *  You can continue cutting pieces out of here and turning them into
 *  real React components whenever you feel like it.
 */

import { initializeNoteLinkBlinking } from "./annotationsHandling";
import { dealWithSW } from "./serviceWorker";
import { setupParagraphHighlighting } from "./ui/paragraphHighlighting";
import { initPage } from "./ui/pageInit";

/* ------------------------------------------------------------------ */
/*  The only exported symbol                                           */
/* ------------------------------------------------------------------ */
export async function runLegacyInit() {
  dealWithSW();

  /* ----------------------------------------------------------------
   *  1. Initialise the FB2 pages, scrolling position, SW, etc.
   * ---------------------------------------------------------------- */
  const loadingIndicator = document.getElementById("loading");

  try {
    await initPage();
  } catch (error) {
    console.error("Error initializing page:", error);
    if (loadingIndicator) {
      loadingIndicator.innerHTML = "<div>Error loading book. Please refresh the page.</div>";
    }
  }

  /* ----------------------------------------------------------------
   *  2.  "DOMContentLoaded" kind of stuff
   * ---------------------------------------------------------------- */
  function onDOMLoaded() {
    initializeNoteLinkBlinking(); // <-- kept here for safety;
    //     also wrapped in a React hook upstream

    document.querySelectorAll(".modal-close").forEach((button) => {
      const modal = button.closest(".modal-overlay");
      if (modal) button.addEventListener("click", () => modal.classList.remove("active"));
    });
    setupParagraphHighlighting();

    // Setup optional elements hiding on user inactivity
    let inactivityTimer: number | null = null;
    const INACTIVITY_TIMEOUT = 5000; // 10 seconds

    const hideOptionalElements = () => {
      const optionalElements = document.querySelectorAll(".optional-element") as NodeListOf<HTMLElement>;
      optionalElements.forEach((element) => {
        element.style.transition = "opacity 8s ease-in";
        element.style.opacity = "0";
        element.style.pointerEvents = "none";
      });

      // Also hide the progress indicator
      const progressIndicator = document.querySelector(".progress-indicator") as HTMLElement;
      if (progressIndicator) {
        progressIndicator.style.transition = "opacity 8s ease-in";
        progressIndicator.style.opacity = "0";
        progressIndicator.style.pointerEvents = "none";
      }
    };

    const showOptionalElements = () => {
      const optionalElements = document.querySelectorAll(".optional-element[style*='opacity: 0']") as NodeListOf<HTMLElement>;
      optionalElements.forEach((element) => {
        element.style.transition = "opacity 1s ease-out";
        element.style.opacity = "1";
        element.style.pointerEvents = "auto";
      });

      // Also show the progress indicator
      const progressIndicator = document.querySelector(".progress-indicator") as HTMLElement;
      if (progressIndicator && progressIndicator.style.opacity === "0") {
        progressIndicator.style.transition = "opacity 1s ease-out";
        progressIndicator.style.opacity = "1";
        progressIndicator.style.pointerEvents = "auto";
      }
    };

    const resetInactivityTimer = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
      }
      showOptionalElements();
      inactivityTimer = window.setTimeout(hideOptionalElements, INACTIVITY_TIMEOUT);
    };

    // Start the timer initially
    inactivityTimer = window.setTimeout(hideOptionalElements, INACTIVITY_TIMEOUT);

    // Reset timer on pointer down and keypress
    document.addEventListener("pointerdown", resetInactivityTimer);
    document.addEventListener("keypress", resetInactivityTimer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDOMLoaded);
  } else {
    onDOMLoaded();
  }
}

export async function runLegacyInitJustSW() {
  dealWithSW();
}
