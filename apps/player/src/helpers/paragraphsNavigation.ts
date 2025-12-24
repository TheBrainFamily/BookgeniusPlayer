/**
 * Legacy‑style navigation helpers kept for API compatibility.
 * React owns the "current location" through a proxy, but here we keep
 * the *furthest* location logic and the Return button state exactly
 * as in the original vanilla code.
 */
import { pageWasJustReloaded } from "@player/utils/pageWasJustReloaded";
import { ensureChapterWindow, ensureChapterRangeWindow } from "@player/logic/BookContentVirtualizer";
import { scrollCoordinator, debugLog } from "@player/services/ScrollCoordinator";
import { getBookData } from "@player/state/bookDataStore";
import { activateMediaInRange } from "@player/ui/activateMediaInRange";

/* ------------------------------------------------------------------ */
/*  Export system navigation state checker                           */
export const isSystemNavigationInProgress = (): boolean => scrollCoordinator.isNavigating;

/* ------------------------------------------------------------------ */
import { DEFAULT_LOCATION, Location } from "@player/state/LocationContext";
import debounce from "lodash.debounce";
import { setUrlHash } from "./setUrlHash";
import { offerCandidateLocation, markLayoutUnstable, flushCommit, LAYOUT_UNSTABLE_RESIZE_MS } from "./locationCommitter";
import { getBookFromUrl } from "@player/getBookFromUrl";

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Scroll completion detection helpers                              */
const detectScrollEnd = (element: HTMLElement, callback: () => void, timeout: number = 1000): (() => void) => {
  let scrollTimer: number | null = null;
  let timeoutTimer: number | null = null;
  let isScrolling = false;

  const handleScroll = () => {
    if (!isScrolling) {
      isScrolling = true;
    }

    if (scrollTimer) clearTimeout(scrollTimer);

    scrollTimer = window.setTimeout(() => {
      isScrolling = false;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      callback();
    }, 200); // Detect scroll end after 200ms of no scroll events (increased for reliability)
  };

  // Fallback timeout in case scroll events don't fire properly (e.g., instant scroll)
  timeoutTimer = window.setTimeout(() => {
    if (scrollTimer) clearTimeout(scrollTimer);
    callback();
  }, timeout);

  // Listen for scroll events on the element
  element.addEventListener("scroll", handleScroll, { passive: true });

  // Cleanup function
  return () => {
    if (scrollTimer) clearTimeout(scrollTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    element.removeEventListener("scroll", handleScroll);
  };
};

/* ------------------------------------------------------------------ */

// Mirror the focus-zone heuristics that the IntersectionObserver uses so
// programmatic navigation lands the requested paragraph inside the same area.
const calculateFocusZone = (containerRect: DOMRect) => {
  const topMultiplier = 0.35; // 35vh focus zone start
  let bottomMultiplier = 0.55; // 10vh focus zone height (default)

  // Responsive focus zone adjustments
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // Check media query for landscape mode on smaller wide screens
  const landscapeMediaQuery = window.matchMedia("screen and (orientation: landscape) and (max-width: 1400px)");
  if (landscapeMediaQuery.matches) {
    bottomMultiplier = 0.75; // Use larger focus zone in landscape mode
  }

  // Adjust for smaller screens (mobile)
  if (viewportHeight < 700) {
    bottomMultiplier = 0.9; // Larger zone for smaller screens
  }

  // Adjust for mobile portrait - ensure sufficient zone for chapter detection
  if (viewportWidth < 768 && viewportHeight > viewportWidth) {
    bottomMultiplier = 0.6; // Even larger zone for mobile portrait
  }

  // Adjust for very wide screens
  if (viewportWidth > 1600) {
    bottomMultiplier = 0.52; // Smaller, more precise zone for large screens
  }

  const focusZoneTop = containerRect.top + containerRect.height * topMultiplier;
  const focusZoneBottom = containerRect.top + containerRect.height * bottomMultiplier;
  const focusZoneHeight = Math.max(0, focusZoneBottom - focusZoneTop);

  return { top: focusZoneTop, bottom: focusZoneBottom, height: focusZoneHeight, center: focusZoneTop + focusZoneHeight / 2 } as const;
};

/* ------------------------------------------------------------------ */

/*  Bridge interface for legacy helpers                               */
interface Bridge {
  get: () => Location;
  set: (loc: Location, source?: "user" | "system") => void;
}

let _bridge: Bridge = {
  get: () => DEFAULT_LOCATION,

  set: () => {},
};
export const __setLocationBridge = (b: Bridge) => (_bridge = b);

/* ------------------------------------------------------------------ */
/*  Extended location with timestamp and progress                     */
export interface ExtendedLocation extends Location {
  timestamp?: number;
  progress?: number | null;
}

/* ------------------------------------------------------------------ */
/*  Furthest‑location helpers                                         */
export const getFurthestLocationKey = (): string => {
  return `furthestLocation_${getBookFromUrl()}`;
};

export const getSavedLocation = (): ExtendedLocation => {
  try {
    const key = getFurthestLocationKey();
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_LOCATION;

    const parsed = JSON.parse(raw);
    // Handle both old format (plain Location) and new format (ExtendedLocation)
    return parsed as ExtendedLocation;
  } catch (e) {
    console.warn("[paragraphsNavigation] getSavedLocation error", e);
    return DEFAULT_LOCATION;
  }
};

export const setSavedLocation = (loc: Location | ExtendedLocation, progress?: number | null) => {
  try {
    const key = getFurthestLocationKey();
    const extended: ExtendedLocation = { ...loc, timestamp: Date.now(), progress: progress ?? (loc as ExtendedLocation).progress ?? null };
    localStorage.setItem(key, JSON.stringify(extended));
    // Notify listeners that the furthest saved location advanced
    try {
      const evt = new CustomEvent("furthestLocationUpdated", { detail: extended });
      window.dispatchEvent(evt);
    } catch {
      // In very old browsers CustomEvent might fail; ignore.
    }
  } catch (e) {
    console.warn("Failed to persist saved location", e);
  }
};

/* ------------------------------------------------------------------ */
export const getCurrentLocation = (): Location => _bridge.get();

/**
 * Update current location + potentially the "furthest" bookmark.
 * Never moves the bookmark backwards.
 */
export const setCurrentLocation = (loc: Location) => {
  if (!loc || typeof loc.currentChapter !== "number" || typeof loc.currentParagraph !== "number") {
    console.error("Invalid location provided to setCurrentLocation:", loc);
    return;
  }

  _bridge.set(loc);

  if (!scrollCoordinator.isNavigating) {
    const chapter = Number(loc.currentChapter) || 1;
    const paragraph = Number(loc.currentParagraph) || 0;
    // Replace hash so passive updates don't create extra history entries
    if (import.meta.env.DEV) {
      setUrlHash(chapter, paragraph, "replace");
    }
  }

  // Offer location to committer - it will persist to localStorage and sync to server
  // after stability criteria are met (dwell time, scroll idle, layout stable)
  offerCandidateLocation(loc, { source: "observer" });
};

/* ------------------------------------------------------------------ */
/*  System Navigation Helper                                          */

/**
 * Waits for an element's position and dimensions to be stable for a certain period.
 * Also checks that the container's scroll position is stable to avoid layout shift issues.
 * @param element The HTML element to monitor.
 * @param options Configuration for timeout, polling interval, and stability threshold.
 * @returns A promise that resolves when the element is stable or when the timeout is reached.
 */
const waitForElementStablePosition = (element: HTMLElement, options: { timeout?: number; interval?: number; stableThreshold?: number } = {}): Promise<void> => {
  const { timeout = 3000, interval = 50, stableThreshold = 200 } = options;
  const container = document.getElementById("content-container");

  return new Promise((resolve) => {
    let lastRect: DOMRect | null = null;
    let lastScrollTop: number | null = null;
    let stableTime = 0;
    let checkTimeout: number | null = null;

    const resolveAndCleanup = () => {
      clearTimeout(overallTimeout);
      if (checkTimeout) clearTimeout(checkTimeout);
      debugLog("waitForElementStablePosition resolved", { stableTime });
      resolve();
    };

    // Overall timeout for the whole operation
    const overallTimeout = window.setTimeout(() => {
      debugLog("waitForElementStablePosition timed out");
      if (checkTimeout) clearTimeout(checkTimeout);
      resolve();
    }, timeout);

    const check = () => {
      if (!element || !document.body.contains(element)) {
        resolveAndCleanup(); // Element removed from DOM, stop waiting
        return;
      }

      const currentRect = element.getBoundingClientRect();
      const currentScrollTop = container?.scrollTop ?? 0;

      // Check if element rect is stable (allow small floating point differences)
      const rectStable =
        lastRect &&
        Math.abs(currentRect.top - lastRect.top) < 1 &&
        Math.abs(currentRect.left - lastRect.left) < 1 &&
        Math.abs(currentRect.width - lastRect.width) < 1 &&
        Math.abs(currentRect.height - lastRect.height) < 1;

      // Check if scroll position is stable
      const scrollStable = lastScrollTop !== null && Math.abs(currentScrollTop - lastScrollTop) < 1;

      if (currentRect.width === 0 || currentRect.height === 0) {
        stableTime = 0;
      } else if (rectStable && scrollStable) {
        stableTime += interval;
      } else {
        stableTime = 0;
      }

      lastRect = currentRect;
      lastScrollTop = currentScrollTop;

      if (stableTime >= stableThreshold) {
        resolveAndCleanup();
      } else {
        checkTimeout = window.setTimeout(check, interval);
      }
    };

    check();
  });
};

/**
 * Navigate to a specific location with a system source (triggers scrolling)
 */
export const systemNavigateTo = async (
  loc: { currentChapter: number; currentParagraph: number },
  options: {
    wait?: boolean;
    history?: "push" | "replace";
    /** "instant" preserves old behavior; "smooth" animates scrolling */
    behavior?: "instant" | "smooth";
    /**
     * When true, temporarily mount all chapters between current and target
     * so smooth scrolling shows the full travel distance.
     */
    expandChapterRange?: boolean;
  } = {},
) => {
  if (!loc || typeof loc.currentChapter !== "number" || typeof loc.currentParagraph !== "number") {
    console.error("Invalid location provided to systemNavigateTo:", loc);
    return;
  }

  const { wait = false, history = "replace", behavior = "instant", expandChapterRange = false } = options;

  // Capture where we are *before* updating the bridge so we can compute the range.
  const startingLocation = getCurrentLocation();

  debugLog("systemNavigateTo", { loc, options: { wait, history, behavior, expandChapterRange } });
  scrollCoordinator.setNavigating(true);

  const fullLocation: Location = {
    chapter: loc.currentChapter,
    paragraph: loc.currentParagraph,
    endChapter: loc.currentChapter,
    endParagraph: loc.currentParagraph,
    currentChapter: loc.currentChapter,
    currentParagraph: loc.currentParagraph,
    earliestVisibleParagraph: loc.currentParagraph,
    latestVisibleParagraph: loc.currentParagraph,
    earliestVisibleChapter: loc.currentChapter,
    latestVisibleChapter: loc.currentChapter,
  };

  // Use the bridge to set location with system source
  _bridge.set(fullLocation, "system");

  // Update the saved location to prevent conflicts
  const saved = getSavedLocation();
  if (!saved) {
    setSavedLocation(fullLocation);
  } else {
    const ahead = loc.currentChapter > saved.currentChapter || (loc.currentChapter === saved.currentChapter && loc.currentParagraph > saved.currentParagraph);
    if (ahead) {
      setSavedLocation(fullLocation);
    }
  }

  // Update hash immediately for system navigation
  // For system navigation (explicit user jumps), default to push.
  // Callers can pass history: "replace" for initial load or non-history-affecting moves.

  try {
    if (expandChapterRange) {
      const fromChapter = typeof startingLocation.currentChapter === "number" ? startingLocation.currentChapter : loc.currentChapter;
      await ensureChapterRangeWindow(fromChapter, loc.currentChapter);
    } else {
      await ensureChapterWindow(loc.currentChapter);
    }

    // Wait for layout to stabilize after chapter mounting
    await scrollCoordinator.waitForLayoutStability();

    // Pre-populate avatars around the target location so they're visible when scroll completes
    const bookData = getBookData();
    const isPlayFormat = bookData.metadata.bookForm === "play" || bookData.metadata.bookForm === "mixed";
    const targetParagraph = loc.currentParagraph;
    const bufferSize = 5;
    activateMediaInRange(loc.currentChapter, Math.max(0, targetParagraph - bufferSize), loc.currentChapter, targetParagraph + bufferSize, isPlayFormat);

    const selector =
      loc.currentParagraph === 0 ? `section[data-chapter="${loc.currentChapter}"]` : `section[data-chapter="${loc.currentChapter}"] [data-index="${loc.currentParagraph}"]`;
    const element = document.querySelector(selector) as HTMLElement | null;

    if ((pageWasJustReloaded() || wait) && element) {
      await waitForElementStablePosition(element);
    }

    // Smooth or instant scroll based on caller's request.
    await goToParagraph({ currentChapter: loc.currentChapter, currentParagraph: loc.currentParagraph }, { behavior });

    // Force location to the target immediately after scroll completes
    // This ensures the location state is correct before any chapter window changes
    _bridge.set(fullLocation, "system");

    // After the smooth "travel" completes, shrink back to a small window
    // around the target so normal virtualization resumes.
    if (expandChapterRange) {
      await ensureChapterWindow(loc.currentChapter);
    }

    // Sync scroll position after navigation to update scroll direction tracking
    scrollCoordinator.syncScrollPosition();

    // Force a final location sync after everything is done
    // This ensures the observer picks up the correct paragraph when it resumes
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        _bridge.set(fullLocation, "system");
        resolve();
      });
    });

    debugLog("systemNavigateTo complete", { loc });
  } catch (error) {
    console.error("systemNavigateTo: Error during navigation", error);
  } finally {
    scrollCoordinator.setNavigating(false);
    // Trigger observer re-processing to activate media after navigation completes
    // Must be after setNavigating(false) so the observer doesn't early-exit
    window.dispatchEvent(new Event("navigationComplete"));
  }
};

/* ------------------------------------------------------------------ */
/*  Scroll helper                                                     */
export const goToParagraph = (loc: { currentChapter: number; currentParagraph: number }, options: ScrollToOptions = { behavior: "smooth" }): Promise<void> => {
  console.log("CurrentLocation", getCurrentLocation());
  return new Promise((resolve, reject) => {
    const selector =
      loc.currentParagraph === 0 ? `section[data-chapter="${loc.currentChapter}"]` : `section[data-chapter="${loc.currentChapter}"] [data-index="${loc.currentParagraph}"]`;
    const element = document.querySelector(selector) as HTMLElement;

    if (!element) {
      console.warn(`Element not found for selector: ${selector}`);
      reject(new Error(`Element not found for selector: ${selector}`));
      return;
    }

    const contentContainer = document.getElementById("content-container");
    // if (!contentContainer) {
    //   // Fallback for safety, though the container should always exist.
    //   element.scrollIntoView({ behavior: options.behavior, block: "start" });

    //   if (options.behavior === "instant") {
    //     requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    //   } else {
    //     // For smooth scroll without a container, we can't detect the end, so we use a timeout.
    //     setTimeout(resolve, 1000);
    //   }
    //   return;
    // }

    const containerRect = contentContainer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    const { center: focusZoneCenter, top: focusZoneTop } = calculateFocusZone(containerRect);

    const containerScrollPosition = contentContainer.scrollTop;
    const elementOffsetWithinContainer = elementRect.top - containerRect.top;

    let zoneAlignedScrollTop: number;
    if (loc.currentParagraph === 0) {
      zoneAlignedScrollTop = containerScrollPosition + elementOffsetWithinContainer - focusZoneTop;
    } else {
      const elementCenterOffset = elementOffsetWithinContainer + elementRect.height / 2;

      // Align the element's visual center with the focus-zone center so the
      // observer selects the same paragraph that was requested.
      zoneAlignedScrollTop = containerScrollPosition + elementCenterOffset - focusZoneCenter;
    }
    const normalizedScrollTop = (() => {
      if (!Number.isFinite(zoneAlignedScrollTop)) {
        return containerScrollPosition;
      }

      const maxScrollTop = contentContainer.scrollHeight - containerRect.height;
      return Math.min(Math.max(zoneAlignedScrollTop, 0), Math.max(0, maxScrollTop));
    })();

    contentContainer.scrollTo({ top: normalizedScrollTop, behavior: options.behavior });

    if (options.behavior === "instant") {
      // We use a double requestAnimationFrame to wait for the browser to repaint
      // and for the IntersectionObserver to process the changes. This is critical
      // to prevent a race condition where the observer selects the wrong paragraph
      // immediately after a system navigation.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    } else {
      // For smooth scroll, we use an event-based detector to know when it's finished.
      const cleanup = detectScrollEnd(
        contentContainer,
        () => {
          cleanup(); // Stop the listeners.
          resolve(); // Signal that the scroll is complete.
        },
        2000,
      ); // A 2-second fallback timeout for safety.
    }
  });
};

// @ts-expect-error window.goToParagraph is not typed
window.goToParagraph = goToParagraph;

/**
 * Determines if the return-to-location button should be shown
 * based on the current location vs. saved location
 */
export const shouldShowReturnButton = (): boolean => {
  const current = getCurrentLocation();
  const saved = getSavedLocation();

  return saved.currentChapter > current.currentChapter || (saved.currentChapter === current.currentChapter && saved.currentParagraph - 5 > current.currentParagraph);
};

/* ------------------------------------------------------------------ */
/*  Handle Resize/Orientation Changes                                 */
/*  Uses "Resize Transaction" pattern with pixel-based anchor         */
/*  compensation to prevent position jumps during orientation changes */

// Resize/Orientation Transaction State
type ResizeTransaction = { anchor: HTMLElement | null; beforeOffset: number; loc: Location } | null;

let resizeTxn: ResizeTransaction = null;

/**
 * Capture anchor SYNCHRONOUSLY when event fires - before observer can run.
 * This is critical: we must lock and capture state before the debounced
 * compensation runs, otherwise the observer might update location first.
 */
function captureResizeAnchor(): void {
  if (resizeTxn) return; // Already in transaction

  // Mark layout unstable for committer (blocks persistence during transition)
  markLayoutUnstable("resize", LAYOUT_UNSTABLE_RESIZE_MS);

  const container = document.getElementById("content-container");
  if (!container) return;

  // Prefer .active-paragraph (canonical "what user is reading")
  const anchor = document.querySelector<HTMLElement>(".active-paragraph") ?? container.querySelector<HTMLElement>("[data-index]");

  const containerRect = container.getBoundingClientRect();
  const beforeOffset = anchor ? anchor.getBoundingClientRect().top - containerRect.top : 0;

  resizeTxn = { anchor, beforeOffset, loc: getCurrentLocation() };

  // CRITICAL: Lock SYNCHRONOUSLY before debounce - prevents observer/spacer changes
  scrollCoordinator.setNavigating(true);
  scrollCoordinator.setSuppressTracking(true);
}

/**
 * Apply compensation after layout stabilizes.
 * Uses pixel-based delta (same technique as BookContentVirtualizer.compensateForPrepend)
 * rather than focus-zone-based goToParagraph, because focus zone dimensions change
 * with orientation and would cause a visible re-centering jump.
 */
async function applyResizeCompensation(): Promise<void> {
  const txn = resizeTxn;
  if (!txn) return;

  const container = document.getElementById("content-container");
  if (!container) return;

  try {
    // Wait for orientation/resize layout cascade to settle
    await scrollCoordinator.waitForLayoutStability(5);

    const containerRect = container.getBoundingClientRect();

    if (txn.anchor && txn.anchor.isConnected) {
      // Pixel-based compensation (same technique as BookContentVirtualizer)
      const afterOffset = txn.anchor.getBoundingClientRect().top - containerRect.top;
      const delta = afterOffset - txn.beforeOffset;
      if (delta !== 0) {
        container.scrollTop += delta;
        debugLog("applyResizeCompensation pixel delta", { delta, scrollTop: container.scrollTop });
      }
    } else {
      // Fallback: anchor disconnected (chapter unloaded), scroll by location
      debugLog("applyResizeCompensation fallback to location", txn.loc);
      await ensureChapterWindow(txn.loc.currentChapter);
      await goToParagraph({ currentChapter: txn.loc.currentChapter, currentParagraph: txn.loc.currentParagraph }, { behavior: "instant" });
    }
  } catch (error) {
    console.warn("Failed to apply resize compensation:", error);
  } finally {
    // Normalize scroll state + unlock
    scrollCoordinator.setSuppressTracking(false);
    scrollCoordinator.resetDirection(); // Clear stale "down" that could trigger spacer transitions
    scrollCoordinator.setNavigating(false);
    resizeTxn = null;

    // Trigger clean observer recompute with stable DOM
    window.dispatchEvent(new Event("navigationComplete"));
  }
}

const applyResizeCompensationDebounced = debounce(() => void applyResizeCompensation(), 150, { leading: false, trailing: true });

// Event handlers - capture SYNCHRONOUSLY, apply debounced
window.addEventListener("resize", () => {
  captureResizeAnchor();
  applyResizeCompensationDebounced();
});

window.addEventListener("orientationchange", () => {
  captureResizeAnchor();
  applyResizeCompensationDebounced();
});

// Export for testing/debugging
export const onResizeOrOrientationChange = () => {
  captureResizeAnchor();
  applyResizeCompensationDebounced();
};

/* ------------------------------------------------------------------ */
/*  Safari Background/Foreground Handling                             */
/*  Safari may fire resize on visibility change; use resize           */
/*  transaction pattern for consistent position stabilization         */

const handleVisibilityChange = () => {
  if (document.visibilityState === "visible") {
    // Use the same resize transaction pattern - Safari often fires resize alongside visibility
    captureResizeAnchor();
    applyResizeCompensationDebounced();
  }
};

document.addEventListener("visibilitychange", handleVisibilityChange);

// Handle Safari bfcache (back-forward cache) restoration
const handlePageShow = (event: PageTransitionEvent) => {
  if (event.persisted) {
    // Page was restored from bfcache - stabilize position
    captureResizeAnchor();
    applyResizeCompensationDebounced();
  }
};

window.addEventListener("pageshow", handlePageShow);

// Flush commit on pagehide - best-effort save of stable position before leaving
window.addEventListener("pagehide", () => {
  flushCommit();
});

/* ------------------------------------------------------------------ */
/*  URL Hash Helpers                                                  */

export const parseLocationFromHash = (): Location | null => {
  const hash = window.location.hash.substring(1); // Remove leading #

  if (!hash) return null;

  const parts = hash.split("-");
  if (parts.length === 2) {
    const currentChapter = parseInt(parts[0], 10);
    const currentParagraph = parseInt(parts[1], 10);

    if (!isNaN(currentChapter) && !isNaN(currentParagraph)) {
      // Create a partial Location object - endChapter/endParagraph aren't in the hash
      return {
        chapter: currentChapter,
        paragraph: currentParagraph,
        endChapter: currentChapter,
        endParagraph: currentParagraph,
        currentChapter,
        currentParagraph,
        earliestVisibleParagraph: currentParagraph,
        latestVisibleParagraph: currentParagraph,
        earliestVisibleChapter: currentChapter,
        latestVisibleChapter: currentChapter,
      };
    }
  }
  console.warn("Invalid location hash:", hash);
  return null;
};

/* ------------------------------------------------------------------ */
/*  Initial Load from URL Hash                                        */
export const goToInitialLocationFromHash = async () => {
  // Reading position has already been reconciled with server in bookDataPreloader.ts
  // localStorage now contains the correct (most recent) position

  const locationFromHash = parseLocationFromHash();
  debugLog("locationFromHash", locationFromHash);

  if (locationFromHash) {
    // Use system navigation for the initial load from hash
    await systemNavigateTo(locationFromHash, { history: "replace" });
  } else {
    await systemNavigateTo(getSavedLocation(), { history: "replace", wait: true });
  }
};
