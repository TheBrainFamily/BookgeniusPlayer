/**
 *  Legacy imperative navigation helpers *rewired* through a proxy so
 *  React can own the single source of truth while the old code keeps its
 *  public API unchanged.
 */

type Location = { chapter: number; paragraph: number; endChapter: number; endParagraph: number };

/* ------------------------------------------------------------- */
/*  Proxy that React will overwrite from LocationProvider        */
/* ------------------------------------------------------------- */
type Bridge = { get: () => Location; set: (l: Location) => void };
let _bridge: Bridge = {
  get: () => ({ chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0 }),
  // eslint‑disable-next-line @typescript-eslint/no-empty-function
  set: () => {},
};
/** Called from state/LocationContext so legacy helpers keep working. */
export const __setLocationBridge = (b: Bridge) => {
  _bridge = b;
};

/* ------------------------------------------------------------- */
/*  Public API (unchanged)                                       */
/* ------------------------------------------------------------- */
export const getSavedLocation = (): Location => {
  const raw = localStorage.getItem("furthestLocation");
  return raw ? JSON.parse(raw) : { chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0 };
};
export const setSavedLocation = (loc: Location) => localStorage.setItem("furthestLocation", JSON.stringify(loc));

export const getCurrentLocation = (): Location => _bridge.get();
export const setCurrentLocation = (loc: Location) => {
  _bridge.set(loc); // React state + LS handled in provider
  updateGoBackButton();
};

/* go‑to‑paragraph logic unchanged ---------------------------------- */
export const goToParagraph = (loc: Location) => {
  setCurrentLocation(loc);
  const { chapter, paragraph } = loc;
  const selector = `section[data-chapter="${chapter}"] [data-index="${paragraph}"]`;
  document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

/* ------------------------------------------------------------- */
/*  UI helpers (same code you had)                               */
/* ------------------------------------------------------------- */
const returnButton = document.getElementById("return-to-location-button");

if (returnButton) {
  returnButton.addEventListener("click", () => {
    goToParagraph(getSavedLocation());
    returnButton.style.display = "none";
  });
} else {
  console.warn("returnButton not found");
  // late mount fallback
  setTimeout(() => {
    returnButton?.addEventListener("click", () => {
      goToParagraph(getSavedLocation());
      returnButton!.style.display = "none";
    });
  }, 500);
}

const updateGoBackButton = () => {
  setTimeout(() => {
    const current = getCurrentLocation();
    const saved = getSavedLocation();
    if (saved.chapter > current.chapter || (saved.chapter === current.chapter && saved.paragraph - 5 > current.paragraph)) {
      returnButton!.style.display = "block";
    } else {
      returnButton!.style.display = "none";
    }
  }, 100);
};
