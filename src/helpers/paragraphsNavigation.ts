/**
 * Legacy‑style navigation helpers kept for API compatibility.
 * React owns the "current location" through a proxy, but here we keep
 * the *furthest* location logic and the Return button state exactly
 * as in the original vanilla code.
 */

let systemNavigationInProgress = false;

/* ------------------------------------------------------------------ */
/*  Export system navigation state checker                           */
export const isSystemNavigationInProgress = (): boolean => systemNavigationInProgress;

/* ------------------------------------------------------------------ */
import { DEFAULT_LOCATION, Location } from "@/state/LocationContext";

/* ------------------------------------------------------------------ */
/*  Event-driven navigation system                                   */
type NavigationEventMap = { "scroll-end": () => void };

type EventName = keyof NavigationEventMap;
type Listener<K extends EventName> = NavigationEventMap[K];

class NavigationEventEmitter {
  private listeners: { [K in EventName]?: Listener<K>[] } = {};

  on<K extends EventName>(event: K, callback: Listener<K>) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(callback);
  }

  off<K extends EventName>(event: K, callback: Listener<K>) {
    if (!this.listeners[event]) return;
    const index = this.listeners[event]!.indexOf(callback);
    if (index > -1) {
      this.listeners[event]!.splice(index, 1);
    }
  }

  emit<K extends EventName>(event: K, ...args: Parameters<Listener<K>>) {
    if (!this.listeners[event]) return;
    this.listeners[event]!.forEach((callback) => (callback as (...args: unknown[]) => void)(...args));
  }
}

export const navigationEvents = new NavigationEventEmitter();

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
    }, 150); // Detect scroll end after 150ms of no scroll events
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
/*  Furthest‑location helpers                                         */
export const getSavedLocation = (): Location | null => {
  try {
    const raw = localStorage.getItem("furthestLocation");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setSavedLocation = (loc: Location) => localStorage.setItem("furthestLocation", JSON.stringify(loc));

/* ------------------------------------------------------------------ */
export const getCurrentLocation = (): Location => _bridge.get();

/**
 * Update current location + potentially the "furthest" bookmark.
 * Never moves the bookmark backwards.
 */
export const setCurrentLocation = (loc: Location, options: { updateHash?: boolean } = {}) => {
  const { updateHash = true } = options;

  if (!loc || typeof loc.currentChapter !== "number" || typeof loc.currentParagraph !== "number") {
    console.error("Invalid location provided to setCurrentLocation:", loc);
    return;
  }

  _bridge.set(loc);

  if (updateHash) {
    setTimeout(() => {
      if (systemNavigationInProgress) {
        return;
      }
      const chapter = Number(loc.currentChapter) || 1;
      const paragraph = Number(loc.currentParagraph) || 0;

      window.location.hash = `${chapter}-${paragraph}`;
    }, 2000);
  }

  const saved = getSavedLocation();
  if (!saved) {
    setSavedLocation(loc);
  } else {
    const isAhead = loc.currentChapter > saved.currentChapter || (loc.currentChapter === saved.currentChapter && loc.currentParagraph > saved.currentParagraph);

    if (isAhead) setSavedLocation(loc);
  }
};

/* ------------------------------------------------------------------ */
/*  System Navigation Helper                                          */
/**
 * Navigate to a specific location with a system source (triggers scrolling)
 */
export const systemNavigateTo = (loc: { currentChapter: number; currentParagraph: number }) => {
  if (!loc || typeof loc.currentChapter !== "number" || typeof loc.currentParagraph !== "number") {
    console.error("Invalid location provided to systemNavigateTo:", loc);
    return;
  }

  systemNavigationInProgress = true;

  const fullLocation: Location = {
    chapter: loc.currentChapter,
    paragraph: loc.currentParagraph,
    endChapter: loc.currentChapter,
    endParagraph: loc.currentParagraph,
    currentChapter: loc.currentChapter,
    currentParagraph: loc.currentParagraph,
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
  window.location.hash = `${loc.currentChapter}-${loc.currentParagraph}`;

  // Listen for scroll completion
  const handleScrollComplete = () => {
    systemNavigationInProgress = false;
    navigationEvents.off("scroll-end", handleScrollComplete);
  };

  navigationEvents.on("scroll-end", handleScrollComplete);

  // Start the scroll with Promise-based completion
  goToParagraph({ currentChapter: loc.currentChapter, currentParagraph: loc.currentParagraph }, { behavior: "instant" })
    .then(() => {
      // Emit scroll-end event when Promise resolves
      navigationEvents.emit("scroll-end");
    })
    .catch((error) => {
      console.error("Error during system navigation scroll:", error);
      // Still end navigation state on error
      systemNavigationInProgress = false;
      navigationEvents.off("scroll-end", handleScrollComplete);
    });
};

/* ------------------------------------------------------------------ */
/*  Scroll helper                                                     */
export const goToParagraph = (loc: { currentChapter: number; currentParagraph: number }, options: ScrollToOptions = { behavior: "smooth" }): Promise<void> => {
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
    if (!contentContainer) {
      // Fallback for safety, though the container should always exist.
      element.scrollIntoView({ behavior: options.behavior, block: "start" });

      if (options.behavior === "instant") {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      } else {
        // For smooth scroll without a container, we can't detect the end, so we use a timeout.
        setTimeout(resolve, 1000);
      }
      return;
    }

    const containerRect = contentContainer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    // The IntersectionObserver's "focus zone" starts at 35% from the top of the container.
    // To ensure the correct paragraph is detected as "active", we must scroll the element
    // to this precise position, for both fast and smooth scrolling.
    const focusZoneOffset = containerRect.height * 0.35;

    const containerScrollPosition = contentContainer.scrollTop;
    const goToParagraphPositionTop = elementRect.top;

    // PINGWING: I understand how ugly this solution is, but after fiddling for the whole day with many possible
    // not working solutions, this one at least works.
    // values 19 and -500 are based on manual experimentation, I'd love to understand what they represent
    let elementOffset = 0;
    const howLongToUseOffsetAfterReload = 2000;
    const millisecondsSinceLoad = performance.now();
    const pageWasJustReloaded = millisecondsSinceLoad < howLongToUseOffsetAfterReload;

    if (pageWasJustReloaded) {
      if (containerScrollPosition === 0) {
        // this happens when we show the page for the first time and we need to jump from the book start to our position
        elementOffset = goToParagraphPositionTop / 19;
      } else {
        // this happens when we refresh
        elementOffset = containerScrollPosition / -500;
      }
    }

    // Calculate the scroll position needed to align the element's top with the focus zone's top.
    const targetScrollTop = containerScrollPosition + elementRect.top - containerRect.top - focusZoneOffset + elementOffset;

    contentContainer.scrollTo({ top: targetScrollTop, behavior: options.behavior });

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
    goToParagraph({ currentChapter: locationFromHash.currentChapter, currentParagraph: locationFromHash.currentParagraph }, { behavior: "instant" }).catch((error) =>
      console.warn("Failed to scroll during resize/orientation change:", error),
    );
  }
  // If hash is invalid or missing, we probably don't want to scroll unexpectedly.
  // The browser's default reflow behavior will apply.
}, 400);

// Add listeners
window.addEventListener("resize", handleResizeOrOrientationChange);
window.addEventListener("orientationchange", handleResizeOrOrientationChange);

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
      return { chapter: currentChapter, paragraph: currentParagraph, endChapter: currentChapter, endParagraph: currentParagraph, currentChapter, currentParagraph };
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
    // Use system navigation for the initial load from hash
    systemNavigateTo({ currentChapter: locationFromHash.currentChapter, currentParagraph: locationFromHash.currentParagraph });
  } else {
    // Fallback if hash is invalid or missing: go to furthest saved location
    const saved = getSavedLocation();

    if (saved) {
      systemNavigateTo({ currentChapter: saved.currentChapter, currentParagraph: saved.currentParagraph });
    } else {
      systemNavigateTo({ currentChapter: 1, currentParagraph: 0 });
    }
  }
};
