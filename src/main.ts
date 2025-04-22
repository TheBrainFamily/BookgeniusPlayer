/*  THIS FILE IS 100 % VANILLA JS ‑ NOTHING RENDERS HERE
 *
 *  We simply copied everything that used to live in main.ts,
 *  removed the `startReactComponents()` call (React is now started
 *  from index.tsx) and wrapped the whole thing into `runLegacyInit()`.
 *  You can continue cutting pieces out of here and turning them into
 *  real React components whenever you feel like it.
 */

import { setIsNightMode } from "./helpers/setIsNightMode";
import { isMobileCharactersVisible } from "./isMobileCharactersVisible";
import { initSearchModal } from "./searchModal";
import { initializeNoteLinkBlinking } from "./annotationsHandling";
import { dealWithSW } from "./serviceWorker";
import { setUpdateParagraphNotesFunction } from "./ui/pageObserver";
import { updateParagraphNotes } from "./ui/paragraphNotes";
import { setupParagraphHighlighting } from "./ui/paragraphHighlighting";
import { setupKeyboardNavigation } from "./utils/keyboardNavigation";
import { initPage } from "./ui/pageInit";
import { initCharacterModals, showCharacterDetailsModal } from "./ui/characterModals";

/* ------------------------------------------------------------------ */
/*  The only exported symbol                                           */
/* ------------------------------------------------------------------ */
export async function runLegacyInit() {
  /* one‑liners that other modules expect to be set up immediately */
  setUpdateParagraphNotesFunction(updateParagraphNotes);
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
   *  2.  “DOMContentLoaded” kind of stuff
   * ---------------------------------------------------------------- */
  function onDOMLoaded() {
    initializeNoteLinkBlinking(); // <-- kept here for safety;
    //     also wrapped in a React hook upstream
    if (localStorage.getItem("nightMode") === "true") setIsNightMode(true);

    initSearchModal();
    initCharacterModals();

    document.querySelectorAll(".modal-close").forEach((button) => {
      const modal = button.closest(".modal-overlay");
      if (modal) button.addEventListener("click", () => modal.classList.remove("active"));
    });

    setupKeyboardNavigation();
    setupParagraphHighlighting();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDOMLoaded);
  } else {
    onDOMLoaded();
  }

  /* ----------------------------------------------------------------
   *  3. Anything that other scripts expect to exist on window
   * ---------------------------------------------------------------- */
  (window as any).showCharacterDetailsModal = showCharacterDetailsModal;

  /* Characters panel initial state (night mode, mobile characters, …) */
  document.getElementById("legacy")?.classList.toggle("characters-hidden", !isMobileCharactersVisible());
}
