/**
 * Legacy‑style navigation helpers kept for API compatibility.
 * React owns the “current location” through a proxy, but here we keep
 * the *furthest* location logic and the Return button state exactly
 * as in the original vanilla code.
 */

/* ------------------------------------------------------------------ */
import { Location } from "@/src/state/LocationContext";
/* ------------------------------------------------------------------ */
/*  Proxy that React overwrites                                       */
type Bridge = { get: () => Location; set: (l: Location) => void };
let _bridge: Bridge = {
  get: () => ({ chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0 }),
  // eslint‑disable-next-line @typescript-eslint/no-empty-function
  set: () => {},
};
export const __setLocationBridge = (b: Bridge) => (_bridge = b);

/* ------------------------------------------------------------------ */
/*  Furthest‑location helpers                                         */
export const getSavedLocation = (): Location => {
  try {
    const raw = localStorage.getItem("furthestLocation");
    return raw ? JSON.parse(raw) : { chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0 };
  } catch {
    return { chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0 };
  }
};

export const setSavedLocation = (loc: Location) => localStorage.setItem("furthestLocation", JSON.stringify(loc));

/* ------------------------------------------------------------------ */
export const getCurrentLocation = (): Location => _bridge.get();

/**
 * Update current location + potentially the “furthest” bookmark.
 * Never moves the bookmark backwards.
 */
export const setCurrentLocation = (loc: Location) => {
  _bridge.set(loc);

  const saved = getSavedLocation();
  const ahead = loc.chapter > saved.chapter || (loc.chapter === saved.chapter && loc.paragraph > saved.paragraph);

  if (ahead) setSavedLocation(loc);

  updateGoBackButton();
};

/* ------------------------------------------------------------------ */
/*  Scroll helper                                                     */
export const goToParagraph = (loc: Location) => {
  setCurrentLocation(loc);
  const selector = `section[data-chapter="${loc.chapter}"] [data-index="${loc.paragraph}"]`;
  document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

/* ------------------------------------------------------------------ */
/*  Return‑to‑location button logic                                   */
const returnButton = document.getElementById("return-to-location-button");

/* ensure listener once */
if (returnButton) {
  returnButton.addEventListener("click", () => {
    goToParagraph(getSavedLocation());
    returnButton.style.display = "none";
  });
}

const updateGoBackButton = () => {
  /* slight delay like the old code (DOM settling after scroll) */
  setTimeout(() => {
    const current = getCurrentLocation();
    const saved = getSavedLocation();
    const shouldShow = saved.chapter > current.chapter || (saved.chapter === current.chapter && saved.paragraph - 5 > current.paragraph);

    if (returnButton) returnButton.style.display = shouldShow ? "block" : "none";
  }, 100);
};
