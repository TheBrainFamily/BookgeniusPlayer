/*  THIS FILE IS 100% VANILLA JS ‑ NOTHING RENDERS HERE
 *
 *  We simply copied everything that used to live in main.ts,
 *  removed the `startReactComponents()` call (React is now started
 *  from index.tsx) and wrapped the whole thing into `runLegacyInit()`.
 *  You can continue cutting pieces out of here and turning them into
 *  real React components whenever you feel like it.
 */

import { initSearchModal } from "./searchModal";
import { initializeNoteLinkBlinking } from "./annotationsHandling";
import { dealWithSW } from "./serviceWorker";
import { setupParagraphHighlighting } from "./ui/paragraphHighlighting";
import { setupKeyboardNavigation } from "./utils/keyboardNavigation";
import { initPage } from "./ui/pageInit";
// import { initCharacterModals, showCharacterDetailsModal } from "./ui/characterModals";

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

    initSearchModal();
    // initCharacterModals();
    document.querySelectorAll(".modal-close").forEach((button) => {
      const modal = button.closest(".modal-overlay");
      if (modal) button.addEventListener("click", () => modal.classList.remove("active"));
    });
    setupKeyboardNavigation();
    setupParagraphHighlighting();

    // Setup optional elements hiding on user inactivity
    let inactivityTimer: number | null = null;
    const INACTIVITY_TIMEOUT = 10000; // 10 seconds

    const hideOptionalElements = () => {
      const optionalElements = document.querySelectorAll(".optional-element");
      optionalElements.forEach((element) => {
        (element as HTMLElement).style.transition = "opacity 8s ease-in";
        (element as HTMLElement).style.opacity = "0";
      });
    };

    const showOptionalElements = () => {
      const optionalElements = document.querySelectorAll(".optional-element[style*='opacity: 0']");
      optionalElements.forEach((element) => {
        (element as HTMLElement).style.transition = "opacity 1s ease-out";
        (element as HTMLElement).style.opacity = "1";
      });
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

    // Reset timer on mouse movement
    document.addEventListener("mousemove", resetInactivityTimer);
    // Also reset on scroll, click and keypress for better user experience
    document.addEventListener("scroll", resetInactivityTimer);
    document.addEventListener("click", resetInactivityTimer);
    document.addEventListener("keypress", resetInactivityTimer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDOMLoaded);
  } else {
    onDOMLoaded();
  }

  /* ----------------------------------------------------------------
   *  3. Anything that other scripts expect to exist on window
   * ---------------------------------------------------------------- */
  // (window as any).showCharacterDetailsModal = showCharacterDetailsModal;

  /* Characters panel initial state (night mode, mobile characters, …) */
}

export async function runLegacyInitJustSW() {
  dealWithSW();
}
