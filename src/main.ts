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
    setupParagraphHighlighting();
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
