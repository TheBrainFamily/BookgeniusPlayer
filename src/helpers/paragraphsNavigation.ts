/**
 * Legacy‑style navigation helpers kept for API compatibility.
 * React owns the "current location" through a proxy, but here we keep
 * the *furthest* location logic and the Return button state exactly
 * as in the original vanilla code.
 */

/* ------------------------------------------------------------------ */
import type { Location } from "@/state/LocationContext";

/* ------------------------------------------------------------------ */
/*  Proxy that React overwrites                                       */
type Bridge = { get: () => Location; set: (l: Location) => void };
let _bridge: Bridge = {
  get: () => ({ chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0, currentChapter: 0, currentParagraph: 0 }),
  // eslint‑disable-next-line @typescript-eslint/no-empty-function
  set: () => {},
};
export const __setLocationBridge = (b: Bridge) => (_bridge = b);

/* ------------------------------------------------------------------ */
/*  Furthest‑location helpers                                         */
export const getSavedLocation = (): Location => {
  try {
    const raw = localStorage.getItem("furthestLocation");
    console.log("getSavedLocation", raw);
    return raw ? JSON.parse(raw) : { chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0, currentChapter: 0, currentParagraph: 0 };
  } catch {
    return { chapter: 0, paragraph: 0, endChapter: 0, endParagraph: 0, currentChapter: 0, currentParagraph: 0 };
  }
};

export const setSavedLocation = (loc: Location) => localStorage.setItem("furthestLocation", JSON.stringify(loc));

/* ------------------------------------------------------------------ */
export const getCurrentLocation = (): Location => _bridge.get();

/**
 * Update current location + potentially the "furthest" bookmark.
 * Never moves the bookmark backwards.
 */
export const setCurrentLocation = (loc: Location) => {
  _bridge.set(loc);

  // Update URL hash
  setTimeout(() => {
    window.location.hash = `${loc.currentChapter}-${loc.currentParagraph}`;
  }, 2000);

  const saved = getSavedLocation();
  const ahead = loc.currentChapter > saved.currentChapter || (loc.currentChapter === saved.currentChapter && loc.currentParagraph > saved.currentParagraph);

  if (ahead) setSavedLocation(loc);

  updateGoBackButton();
};

/* ------------------------------------------------------------------ */
/*  Scroll helper                                                     */
export const goToParagraph = (loc: { currentChapter: number; currentParagraph: number }, fast = false) => {
  // setCurrentLocation({
  //   chapter: loc.currentChapter,
  //   paragraph: loc.currentParagraph,
  //   endChapter: loc.currentChapter,
  //   endParagraph: loc.currentParagraph,
  //   currentChapter: loc.currentChapter,
  //   currentParagraph: loc.currentParagraph,
  // });
  const selector = `section[data-chapter="${loc.currentChapter}"] [data-index="${loc.currentParagraph}"]`;
  document.querySelector(selector)?.scrollIntoView({ behavior: fast ? "instant" : "smooth", block: "start" });
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
    const shouldShow = saved.currentChapter > current.currentChapter || (saved.currentChapter === current.currentChapter && saved.currentParagraph - 5 > current.currentParagraph);

    if (returnButton) returnButton.style.display = shouldShow ? "block" : "none";
  }, 100);
};

/* ------------------------------------------------------------------ */
/*  Handle Resize/Orientation Changes                                 */

// Debounce function
function debounce<T extends (...args: Parameters<T>) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null;
  return (...args: Parameters<T>) => {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Event handler
const handleResizeOrOrientationChange = debounce(() => {
  // Re-apply scroll position based on the location stored in the URL hash
  const locationFromHash = parseLocationFromHash();

  if (locationFromHash) {
    goToParagraph({ currentChapter: locationFromHash.currentChapter, currentParagraph: locationFromHash.currentParagraph }, true);
  }
  // If hash is invalid or missing, we probably don't want to scroll unexpectedly.
  // The browser's default reflow behavior will apply.
}, 400);

// Add listeners
window.addEventListener("resize", handleResizeOrOrientationChange);
window.addEventListener("orientationchange", handleResizeOrOrientationChange);

/* ------------------------------------------------------------------ */
/*  URL Hash Helpers                                                  */

const parseLocationFromHash = (): { currentChapter: number; currentParagraph: number } | null => {
  const hash = window.location.hash.substring(1); // Remove leading #
  if (!hash) return null;

  const parts = hash.split("-");
  if (parts.length === 2) {
    const currentChapter = parseInt(parts[0], 10);
    const currentParagraph = parseInt(parts[1], 10);

    if (!isNaN(currentChapter) && !isNaN(currentParagraph)) {
      // Create a partial Location object - endChapter/endParagraph aren't in the hash
      return { currentChapter, currentParagraph };
    }
  }
  console.warn("Invalid location hash:", hash);
  return null;
};

/* ------------------------------------------------------------------ */
/*  Initial Load from URL Hash                                        */
export const goToInitialLocationFromHash = () => {
  const locationFromHash = parseLocationFromHash();

  if (locationFromHash) {
    // Use goToParagraph which handles setting current location and scrolling
    console.log("going to location from hash", locationFromHash);
    goToParagraph({ currentChapter: locationFromHash.currentChapter, currentParagraph: locationFromHash.currentParagraph }, true);
  } else {
    // Fallback if hash is invalid or missing: go to furthest saved location
    console.warn("no location in hash, using saved location");
    goToParagraph({ currentChapter: getSavedLocation().currentChapter, currentParagraph: getSavedLocation().currentParagraph }, true);
  }
};
