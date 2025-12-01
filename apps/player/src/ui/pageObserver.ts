import { isSystemNavigationInProgress, setCurrentLocation } from "@player/helpers/paragraphsNavigation";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import { drawActiveElement, drawFocusZone, hideVisualizer, initializeDevZoneVisualizers, drawElementsUnion } from "./devVisualizers";
import { activateMediaInRange } from "./activateMediaInRange";
import { scrollCoordinator, debugLog } from "@player/services/ScrollCoordinator";

const DEV_ZONE_VISUALIZERS_ENABLED = false;

// Cache isPlayFormat at module level to avoid repeated getBookData() calls
let cachedIsPlayFormat: boolean | null = null;

function getIsPlayFormat(): boolean {
  if (cachedIsPlayFormat === null) {
    const bookData = getBookData();
    cachedIsPlayFormat = bookData.metadata.bookForm === "play" || bookData.metadata.bookForm === "mixed";
  }
  return cachedIsPlayFormat;
}

let isSplashAnimationComplete = false;

window.addEventListener(
  "splashHidden",
  () => {
    isSplashAnimationComplete = true;
  },
  { once: true },
);

/** Extract Chapter and Paragraph Info **/
const getParagraphInfo = (element: Element): { chapter: number | null; paragraph: number | null } => {
  const el = element as HTMLElement;

  const chapterElement = el.closest("section[data-chapter]") as HTMLElement | null;
  const chapterStr = chapterElement?.dataset.chapter ?? null;

  // Parse chapter safely
  const chNum = chapterStr !== null ? Number.parseInt(chapterStr, 10) : NaN;
  const chapter: number | null = Number.isFinite(chNum) ? chNum : null;

  // Paragraph:
  // Prefer explicit data-index; otherwise treat H3–H6 within a chapter as paragraph 0.
  const idxStr = el.dataset.index ?? null;
  let paragraph: number | null = null;

  if (idxStr !== null) {
    const idxNum = Number.parseInt(idxStr, 10);
    paragraph = Number.isFinite(idxNum) ? idxNum : null;
  } else if (chapter !== null && /^H[3-6]$/.test(el.tagName)) {
    paragraph = 0;
  }

  return { chapter, paragraph };
};

/** RAF scheduler to coalesce many requests into one paint */
function makeRafScheduler<Args extends unknown[]>(fn: (...args: Args) => void) {
  let scheduled = false;
  let lastArgs: Args | null = null;

  return (...args: Args) => {
    lastArgs = args;

    if (scheduled) return;

    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const argsToInvoke = lastArgs;
      lastArgs = null;
      if (argsToInvoke) {
        fn(...argsToInvoke);
      } else {
        fn(...([] as unknown as Args));
      }
    });
  };
}

export function setupPageObserver(): {
  observer: IntersectionObserver;
  observeNewParagraphs: () => number;
  cleanupRemovedParagraphs: () => number;
  observeNewSpacers: () => number;
  cleanupRemovedSpacers: () => number;
  cleanup: () => void;
} | null {
  const rootEl = document.getElementById("content-container");
  if (!rootEl) {
    console.warn("[PageObserver] No #content-container - cannot create observer.");
    return null;
  }

  const observerOptions = { root: rootEl, rootMargin: "0px", threshold: [0.1, 0.25, 0.5, 0.75, 0.8, 0.9, 0.95] };

  // Initialize development zone visualizers
  const { activeElementVisualizer, rangeVisualizer } = DEV_ZONE_VISUALIZERS_ENABLED ? initializeDevZoneVisualizers() : { activeElementVisualizer: null, rangeVisualizer: null };

  // --- State for tracking all currently intersecting pages ---
  const intersectingPages = new Set<Element>();
  let currentlyActivePageElement: Element | null = null;
  let currentlyLastActivePageElement: Element | null = null;
  let currentlyActiveParagraph: { chapter: number; paragraph: number } | null = null;

  // Keep track of observed paragraphs to avoid re-observing
  const observedParagraphs = new Set<Element>();

  // Manage delayed scroll indicator visibility
  let scrollIndicatorTimeoutId: number | null = null;
  let isScrollIndicatorVisible = false;
  let scrollIndicatorTargetChapter: number | null = null;

  const clearScrollIndicatorTimeout = () => {
    if (scrollIndicatorTimeoutId !== null) {
      window.clearTimeout(scrollIndicatorTimeoutId);
      scrollIndicatorTimeoutId = null;
    }
  };

  const hideScrollIndicator = () => {
    clearScrollIndicatorTimeout();
    scrollIndicatorTargetChapter = null;
    if (isScrollIndicatorVisible) {
      window.dispatchEvent(new Event("hideScrollIndicator"));
      isScrollIndicatorVisible = false;
    }
  };

  const handleScrollIndicatorClicked = () => {
    hideScrollIndicator();
  };

  window.addEventListener("scrollIndicatorClicked", handleScrollIndicatorClicked);

  const scheduleScrollIndicator = (nextChapter: number) => {
    if (!Number.isFinite(nextChapter)) {
      return;
    }

    if (isScrollIndicatorVisible && scrollIndicatorTargetChapter === nextChapter) {
      return;
    }

    if (scrollIndicatorTimeoutId !== null) {
      if (scrollIndicatorTargetChapter === nextChapter) {
        return;
      }
      window.clearTimeout(scrollIndicatorTimeoutId);
      scrollIndicatorTimeoutId = null;
    }

    scrollIndicatorTargetChapter = nextChapter;

    if (isScrollIndicatorVisible) {
      window.dispatchEvent(new CustomEvent("showScrollIndicator", { detail: { targetChapter: nextChapter } }));
      return;
    }

    scrollIndicatorTimeoutId = window.setTimeout(() => {
      scrollIndicatorTimeoutId = null;
      isScrollIndicatorVisible = true;
      window.dispatchEvent(new CustomEvent("showScrollIndicator", { detail: { targetChapter: nextChapter } }));
    }, 2000);
  };

  // Prevent redundant location updates when values are equivalent
  type MinimalLoc = { chapter: number; paragraph: number; endChapter: number; endParagraph: number; currentChapter: number; currentParagraph: number };
  let lastSentLocation: MinimalLoc | null = null;
  const isSameLoc = (a: MinimalLoc | null, b: MinimalLoc): boolean => {
    return (
      !!a &&
      a.chapter === b.chapter &&
      a.paragraph === b.paragraph &&
      a.endChapter === b.endChapter &&
      a.endParagraph === b.endParagraph &&
      a.currentChapter === b.currentChapter &&
      a.currentParagraph === b.currentParagraph
    );
  };

  const processIntersections = () => {
    // Skip heavy processing during system navigation - location will be synced at the end
    if (isSystemNavigationInProgress()) {
      return;
    }

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

    const rootRect = observerOptions.root.getBoundingClientRect();
    const focusZoneTop = rootRect.top + rootRect.height * topMultiplier;
    const focusZoneBottom = rootRect.top + rootRect.height * bottomMultiplier;
    const focusZoneCenter = (focusZoneTop + focusZoneBottom) / 2;

    if (DEV_ZONE_VISUALIZERS_ENABLED) {
      drawFocusZone(rangeVisualizer, rootEl, focusZoneTop, focusZoneBottom);
    }

    let activeParagraph: { chapter: number | null; paragraph: number | null } | null = null;
    let maxPercentageOverlapRatio = -1;
    let chosenElement: Element | null = null;
    let foundFullyVisible = false;
    let bestCenterDistance = Number.POSITIVE_INFINITY;
    // Minimum overlap threshold in pixels to consider an element
    const MIN_OVERLAP_THRESHOLD = 15;

    // First pass: look for fully visible elements; choose the one closest to the focus-zone center
    intersectingPages.forEach((element) => {
      const rect = element.getBoundingClientRect();

      // Get computed styles to account for margins for accurate positioning
      const computedStyle = window.getComputedStyle(element);
      const marginTop = parseFloat(computedStyle.marginTop);
      const marginBottom = parseFloat(computedStyle.marginBottom);

      // Calculate true visual bounds including margins
      const visualTop = rect.top - marginTop;
      const visualBottom = rect.bottom + marginBottom;

      // Check if element is fully contained within the zone and has content
      if (visualTop >= focusZoneTop && visualBottom <= focusZoneBottom && element.textContent?.trim() !== "") {
        // Element is fully visible in the zone; prefer the one whose center is closest to the focus-zone center
        const elementCenter = (visualTop + visualBottom) / 2;
        const centerDistance = Math.abs(elementCenter - focusZoneCenter);
        if (!foundFullyVisible || centerDistance < bestCenterDistance) {
          foundFullyVisible = true;
          bestCenterDistance = centerDistance;
          activeParagraph = getParagraphInfo(element);
          chosenElement = element;
          maxPercentageOverlapRatio = 1.0; // 100% visible
        }
      }
    });

    // Only proceed to second pass if no fully visible elements were found
    if (!foundFullyVisible) {
      intersectingPages.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.height === 0) return; // Skip zero-height elements

        // Get computed styles to account for margins for accurate overlap calculation
        const computedStyle = window.getComputedStyle(element);
        const marginTop = parseFloat(computedStyle.marginTop);
        const marginBottom = parseFloat(computedStyle.marginBottom);

        // Calculate true visual bounds including margins
        const visualTop = rect.top - marginTop;
        const visualBottom = rect.bottom + marginBottom;
        const visualHeight = visualBottom - visualTop;

        // Calculate overlap using visual bounds
        const overlapTop = Math.max(visualTop, focusZoneTop);
        const overlapBottom = Math.min(visualBottom, focusZoneBottom);
        const overlap = Math.max(0, overlapBottom - overlapTop);

        // Skip elements with minimal overlap
        if (overlap < MIN_OVERLAP_THRESHOLD) return;

        // Skip elements with no text content
        if (element.textContent?.trim() === "") return;

        let currentOverlapRatio = 0;

        if (visualHeight > 0) {
          currentOverlapRatio = overlap / visualHeight;
        }

        // Use a weighted combination of absolute overlap and percentage overlap,
        // with center proximity as a tie-breaker to align with programmatic scrolling
        const ABSOLUTE_WEIGHT = 0.7;
        const PERCENTAGE_WEIGHT = 0.3;
        const CENTER_WEIGHT = 0.15; // modest bias toward focus-zone center

        const zoneHeight = focusZoneBottom - focusZoneTop;
        const normalizedAbsoluteOverlap = overlap / zoneHeight; // Normalize to 0-1 range
        const weightedScore = normalizedAbsoluteOverlap * ABSOLUTE_WEIGHT + currentOverlapRatio * PERCENTAGE_WEIGHT;

        const elementCenter = (visualTop + visualBottom) / 2;
        const normalizedCenterDistance = Math.min(1, Math.abs(elementCenter - focusZoneCenter) / (zoneHeight / 2));
        const centerProximity = 1 - normalizedCenterDistance; // 1 at center, 0 near edges

        const finalScore = weightedScore + centerProximity * CENTER_WEIGHT;

        if (finalScore > maxPercentageOverlapRatio) {
          maxPercentageOverlapRatio = finalScore;
          activeParagraph = getParagraphInfo(element);
          chosenElement = element;
        }
      });
    }

    rootEl.querySelectorAll(".active-paragraph").forEach((element) => {
      element.classList.remove("active-paragraph");
    });
    chosenElement?.classList.add("active-paragraph");

    if (DEV_ZONE_VISUALIZERS_ENABLED) {
      if (chosenElement) {
        drawActiveElement(activeElementVisualizer, chosenElement);
      } else {
        hideVisualizer(activeElementVisualizer);
      }
    }
    if (intersectingPages.size > 0) {
      // Filter intersecting pages to find those overlapping the focus zone
      const focusedPages = Array.from(intersectingPages).filter((element) => {
        const elementRect = element.getBoundingClientRect();
        // Check if element's vertical range overlaps with the focus zone
        return elementRect.top < focusZoneBottom && elementRect.bottom > focusZoneTop;
      });

      if (focusedPages.length > 0) {
        if (DEV_ZONE_VISUALIZERS_ENABLED) {
          drawElementsUnion(rangeVisualizer, focusedPages);
        }

        // Sort the focused pages by their viewport top position
        focusedPages.sort((a, b) => {
          return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        });

        const topFocusedPageElement = focusedPages[0];
        const bottomFocusedPageElement = focusedPages[focusedPages.length - 1];

        let activeParagraphChanged = false;
        if (!currentlyActiveParagraph && activeParagraph) {
          activeParagraphChanged = true;
        } else if (currentlyActiveParagraph && !activeParagraph) {
          activeParagraphChanged = true;
        } else if (currentlyActiveParagraph && activeParagraph) {
          if (currentlyActiveParagraph.chapter !== activeParagraph.chapter || currentlyActiveParagraph.paragraph !== activeParagraph.paragraph) {
            activeParagraphChanged = true;
          }
        }

        // --- Determine if topFocusedPageElement has changed (value-based) ---
        let topElementChanged = false;
        const newTopInfo = topFocusedPageElement ? getParagraphInfo(topFocusedPageElement) : null;
        // Get info for currentlyActivePageElement (which was the top element from the PREVIOUS run)
        const currentTopInfoFromState = currentlyActivePageElement ? getParagraphInfo(currentlyActivePageElement) : null;

        if ((!newTopInfo && currentTopInfoFromState) || (newTopInfo && !currentTopInfoFromState)) {
          topElementChanged = true;
        } else if (newTopInfo && currentTopInfoFromState) {
          if (newTopInfo.chapter !== currentTopInfoFromState.chapter || newTopInfo.paragraph !== currentTopInfoFromState.paragraph) {
            topElementChanged = true;
          }
        }

        // --- Determine if bottomFocusedPageElement has changed (value-based) ---
        let bottomElementChanged = false;
        const newBottomInfo = bottomFocusedPageElement ? getParagraphInfo(bottomFocusedPageElement) : null;
        // Get info for currentlyLastActivePageElement (which was the bottom element from the PREVIOUS run)
        const currentBottomInfoFromState = currentlyLastActivePageElement ? getParagraphInfo(currentlyLastActivePageElement) : null;

        if ((!newBottomInfo && currentBottomInfoFromState) || (newBottomInfo && !currentBottomInfoFromState)) {
          bottomElementChanged = true;
        } else if (newBottomInfo && currentBottomInfoFromState) {
          if (newBottomInfo.chapter !== currentBottomInfoFromState.chapter || newBottomInfo.paragraph !== currentBottomInfoFromState.paragraph) {
            bottomElementChanged = true;
          }
        }

        // Always calculate the intersecting paragraphs and visible range for media
        // This ensures media is activated even on initial load without scroll
        const allIntersectingParagraphs = Array.from(intersectingPages)
          .map((element) => getParagraphInfo(element))
          .filter((info) => info.chapter !== null && !isNaN(info.chapter) && info.paragraph !== null && !isNaN(info.paragraph))
          .sort((a, b) => {
            if (a.chapter !== b.chapter) return a.chapter - b.chapter;
            return a.paragraph - b.paragraph;
          });

        const isMobile = viewportHeight < 700 || viewportWidth < 768;

        // On mobile, capture full viewport; on desktop, use 10% to 70% from top
        const visibilityZoneTop = isMobile ? rootRect.top : rootRect.top + rootRect.height * 0.1;
        const visibilityZoneBottom = isMobile ? rootRect.bottom : rootRect.top + rootRect.height * 0.7;

        // Filter intersecting paragraphs to only include those within the visibility zone
        const focusZoneIntersectingParagraphs = Array.from(intersectingPages)
          .filter((element) => {
            const elementRect = element.getBoundingClientRect();
            // Check if element's vertical range overlaps with the visibility zone
            return elementRect.top < visibilityZoneBottom && elementRect.bottom > visibilityZoneTop;
          })
          .map((element) => getParagraphInfo(element))
          .filter((info) => info.chapter !== null && !isNaN(info.chapter) && info.paragraph !== null && !isNaN(info.paragraph))
          .sort((a, b) => {
            if (a.chapter !== b.chapter) return a.chapter - b.chapter;
            return a.paragraph - b.paragraph;
          });

        const RANGE_PADDING = 1;
        const isPlayFormat = getIsPlayFormat();

        if (topElementChanged || bottomElementChanged || activeParagraphChanged) {
          // Update persisted state with the NEW DOM element references for the next comparison cycle
          currentlyActivePageElement = topFocusedPageElement;
          currentlyLastActivePageElement = bottomFocusedPageElement;
          currentlyActiveParagraph = activeParagraph ? { chapter: activeParagraph.chapter, paragraph: activeParagraph.paragraph } : null;

          // Use startInfo and endInfo derived from the NEW topFocusedPageElement and bottomFocusedPageElement
          const startInfo = newTopInfo; // Already derived
          const endInfo = newBottomInfo; // Already derived

          if (
            activeParagraph &&
            activeParagraph.chapter !== null &&
            activeParagraph.paragraph !== null &&
            startInfo &&
            startInfo.chapter !== null &&
            startInfo.paragraph !== null &&
            endInfo &&
            endInfo.chapter !== null &&
            endInfo.paragraph !== null
          ) {
            const rangeStartInfo = startInfo;
            const rangeEndInfo = endInfo;

            let expandedStartParagraph = Math.max(1, rangeStartInfo.paragraph - RANGE_PADDING);
            const expandedEndParagraph = rangeEndInfo.paragraph + RANGE_PADDING;

            if (isPlayFormat && rangeStartInfo.paragraph <= 3) {
              expandedStartParagraph = 0;
            }

            const nextLoc: MinimalLoc = {
              chapter: rangeStartInfo.chapter,
              paragraph: expandedStartParagraph,
              endChapter: rangeEndInfo.chapter,
              endParagraph: expandedEndParagraph,
              currentChapter: activeParagraph.chapter,
              currentParagraph: activeParagraph.paragraph,
            };

            if (!isSameLoc(lastSentLocation, nextLoc)) {
              // Avoid overriding programmatic navigation mid-scroll
              if (isSystemNavigationInProgress()) {
                // Defer location update until system navigation finishes
              } else {
                setCurrentLocation({
                  chapter: rangeStartInfo.chapter,
                  paragraph: expandedStartParagraph,
                  endChapter: rangeEndInfo.chapter,
                  endParagraph: expandedEndParagraph,
                  currentChapter: activeParagraph.chapter,
                  currentParagraph: activeParagraph.paragraph,
                  earliestVisibleParagraph: focusZoneIntersectingParagraphs[0]?.paragraph ?? null,
                  latestVisibleParagraph: focusZoneIntersectingParagraphs[focusZoneIntersectingParagraphs.length - 1]?.paragraph ?? null,
                  earliestVisibleChapter: focusZoneIntersectingParagraphs[0]?.chapter ?? null,
                  latestVisibleChapter: focusZoneIntersectingParagraphs[focusZoneIntersectingParagraphs.length - 1]?.chapter ?? null,
                });
                lastSentLocation = nextLoc;
              }
            }
          } else {
            console.warn("[Observer] Could not update location: activeParagraph or start/end info is invalid.", {
              activePgh: activeParagraph,
              startInfo: startInfo,
              endInfo: endInfo,
            });
          }
        }

        // Always activate media for currently visible paragraphs
        // This ensures media loads immediately on page load and chapter transitions
        if (allIntersectingParagraphs.length > 0) {
          const mediaStartInfo = allIntersectingParagraphs[0];
          const mediaEndInfo = allIntersectingParagraphs[allIntersectingParagraphs.length - 1];
          activateMediaInRange(mediaStartInfo.chapter, mediaStartInfo.paragraph, mediaEndInfo.chapter, mediaEndInfo.paragraph, isPlayFormat);
        } else if (
          newTopInfo &&
          newBottomInfo &&
          newTopInfo.chapter !== null &&
          newTopInfo.paragraph !== null &&
          newBottomInfo.chapter !== null &&
          newBottomInfo.paragraph !== null
        ) {
          // Fallback to focus zone range if no intersecting paragraphs found
          activateMediaInRange(newTopInfo.chapter, newTopInfo.paragraph, newBottomInfo.chapter, newBottomInfo.paragraph, isPlayFormat);
        }
      } else {
        // Handle case where intersecting pages exist, but none are in the focus zone
        if (DEV_ZONE_VISUALIZERS_ENABLED) {
          hideVisualizer(rangeVisualizer);
          hideVisualizer(activeElementVisualizer);
        }

        if (currentlyActivePageElement !== null) {
          // Decide if you want to clear the active elements or keep the last known ones
          // currentlyActivePageElement = null;
          // currentlyLastActivePageElement = null;
          // updateParagraphNotes({ startChapter: null, startParagraph: null, endChapter: null, endParagraph: null }); // Example: Clear notes
        }
      }
    } else {
      // Handle case where no pages are intersecting the viewport at all
      if (DEV_ZONE_VISUALIZERS_ENABLED) {
        hideVisualizer(rangeVisualizer);
        hideVisualizer(activeElementVisualizer);
      }

      if (currentlyActivePageElement !== null) {
        // currentlyActivePageElement = null;
        // currentlyLastActivePageElement = null;
      }
    }
  };

  const scheduledProcessIntersections = makeRafScheduler(processIntersections);

  const handleResize = () => scheduledProcessIntersections();
  const handleOrientationChange = () => scheduledProcessIntersections();
  // Allow navigation to trigger a forced re-process after smooth scroll completes
  const handleNavigationComplete = () => scheduledProcessIntersections();

  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleOrientationChange);
  window.addEventListener("navigationComplete", handleNavigationComplete);

  const handleIntersectionEntries = (entries: IntersectionObserverEntry[]) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        intersectingPages.add(entry.target);
      } else {
        intersectingPages.delete(entry.target);
      }
    });

    scheduledProcessIntersections();
  };

  // ----------------------------------------------------------
  const observer = new IntersectionObserver((entries) => {
    handleIntersectionEntries(entries);
  }, observerOptions);

  // Function to observe new paragraphs
  const observeNewParagraphs = (): number => {
    const allParagraphs = rootEl.querySelectorAll("section[data-chapter] [data-index]");
    let newParagraphsCount = 0;

    allParagraphs.forEach((paragraph) => {
      if (!observedParagraphs.has(paragraph)) {
        observer.observe(paragraph);
        observedParagraphs.add(paragraph);
        newParagraphsCount++;
      }
    });

    if (newParagraphsCount > 0) {
      console.log(`[PageObserver] Observed ${newParagraphsCount} new paragraphs. Total observed: ${observedParagraphs.size}`);
    }

    return newParagraphsCount;
  };

  // Function to clean up paragraphs that are no longer in the DOM
  const cleanupRemovedParagraphs = (): number => {
    let removedCount = 0;
    const elementsToRemove: Element[] = [];

    observedParagraphs.forEach((paragraph) => {
      // Check if the element is still connected to the DOM
      if (!paragraph.isConnected) {
        observer.unobserve(paragraph);
        intersectingPages.delete(paragraph); // Also remove from intersecting set
        elementsToRemove.push(paragraph);
        removedCount++;
      }
    });

    // Remove from the Set after iteration to avoid modification during iteration
    elementsToRemove.forEach((element) => {
      observedParagraphs.delete(element);
    });

    // Clear active element references if they're no longer connected
    if (currentlyActivePageElement && !currentlyActivePageElement.isConnected) {
      currentlyActivePageElement = null;
    }
    if (currentlyLastActivePageElement && !currentlyLastActivePageElement.isConnected) {
      currentlyLastActivePageElement = null;
    }

    if (removedCount > 0) {
      console.log(`[PageObserver] Cleaned up ${removedCount} removed paragraphs. Total observed: ${observedParagraphs.size}`);
    }

    return removedCount;
  };

  // Initial observation
  const paragraphsToObserve = rootEl.querySelectorAll("section[data-chapter] [data-index]");

  const spacersToObserve = rootEl.querySelectorAll(".transition-spacer");

  const spacerObserver = new IntersectionObserver(
    (entries) => {
      // Skip processing during system navigation to avoid interfering with smooth scroll
      if (isSystemNavigationInProgress()) {
        return;
      }

      entries.forEach((entry) => {
        if (!isSplashAnimationComplete) return;

        const rect = entry.boundingClientRect;
        const rootBounds = entry.rootBounds ?? rootEl.getBoundingClientRect();

        // Calculate how much of the spacer is visible
        const visibleTop = Math.max(rootBounds.top, rect.top);
        const visibleBottom = Math.min(rootBounds.bottom, rect.bottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const visibilityPercent = entry.intersectionRatio > 0 ? entry.intersectionRatio : rect.height > 0 ? visibleHeight / rect.height : 0;

        // Determine if spacer is entering from bottom or leaving from top
        if (entry.isIntersecting) {
          // Spacer is at least partially visible
          const nextChapterAttr = entry.target.getAttribute("data-next-chapter-start");
          const nextChapter = nextChapterAttr != null ? Number.parseInt(nextChapterAttr, 10) : NaN;

          if (rect.top >= 0) {
            // Spacer is entering from bottom or fully in view
            hideScrollIndicator();
            if (visibilityPercent <= 0.4) {
              // 0-40% visible: keep full opacity
              rootEl.style.setProperty("--gradient-opacity", "1");
            } else if (visibilityPercent < 1.0) {
              // 40-100% visible: fade from 1 to 0
              if (visibilityPercent > 0.75) {
                scheduleScrollIndicator(nextChapter);
              }

              if (visibilityPercent > 0.8 && visibilityPercent < 1 && Number.isFinite(nextChapter)) {
                // Only trigger chapter transition when scrolling DOWN, not navigating, and cooldown passed
                const direction = scrollCoordinator.scrollDirection;
                const canTransition = scrollCoordinator.canTriggerChapterTransition();
                const isNavigating = scrollCoordinator.isNavigating;

                debugLog("spacer threshold", { visibilityPercent, nextChapter, direction, canTransition, isNavigating });

                if (direction === "down" && canTransition && !isNavigating) {
                  scrollCoordinator.recordChapterTransition();
                  setCurrentLocation({
                    chapter: nextChapter,
                    paragraph: 0,
                    endChapter: nextChapter,
                    endParagraph: 0,
                    currentChapter: nextChapter,
                    currentParagraph: 0,
                    earliestVisibleParagraph: 0,
                    latestVisibleParagraph: 0,
                    earliestVisibleChapter: nextChapter,
                    latestVisibleChapter: nextChapter,
                  });
                }
              }

              // Map 0.4 -> 1.0 visibility to 1.0 -> 0.0 opacity
              const fadePercent = (visibilityPercent - 0.4) / 0.6;
              rootEl.style.setProperty("--gradient-opacity", Math.max(0, 1 - fadePercent).toString());
            } else {
              // 100% visible: full transparency
              rootEl.style.setProperty("--gradient-opacity", "0");
            }
          } else {
            // Spacer is leaving from top (rect.top < 0)
            if (visibilityPercent >= 0.6) {
              // Still 60% or more visible: keep transparent
              scheduleScrollIndicator(nextChapter);
              rootEl.style.setProperty("--gradient-opacity", "0");
            } else if (visibilityPercent >= 0.3) {
              // 30-60% visible: fade from 0 to 1
              // When 60% visible -> opacity = 0
              // When 30% visible -> opacity = 1
              const fadePercent = (visibilityPercent - 0.3) / 0.3;
              rootEl.style.setProperty("--gradient-opacity", (1 - fadePercent).toString());
            } else {
              hideScrollIndicator();
              // Less than 30% visible: full opacity
              rootEl.style.setProperty("--gradient-opacity", "1");
            }
          }
        } else {
          // Spacer is completely out of view
          // For a moment when scrolling from top to bottom, the spacer may be
          // considered non-intersecting but still be partially visible if it's
          // very tall and the user scrolls quickly. To handle this, we check
          // the boundingClientRect to see if it's still partially on screen.
          if (rect.bottom > rootBounds.top && rect.top < rootBounds.bottom) {
            // Still partially visible - handle like intersecting case
            if (rect.top >= 0) {
              // Leaving from bottom
              hideScrollIndicator();
              rootEl.style.setProperty("--gradient-opacity", "1");
            } else {
              // Leaving from top
              const nextChapterAttr = entry.target.getAttribute("data-next-chapter-start");
              const nextChapter = nextChapterAttr != null ? Number.parseInt(nextChapterAttr, 10) : NaN;
              scheduleScrollIndicator(nextChapter);
              rootEl.style.setProperty("--gradient-opacity", "0");
            }
            return;
          }

          hideScrollIndicator();
        }
      });
    },
    { threshold: Array.from(Array(51).keys()).map((i) => i / 50) },
  );

  const observedSpacers = new Set<Element>();
  spacersToObserve.forEach((spacer) => {
    spacerObserver.observe(spacer);
    observedSpacers.add(spacer);
  });

  const observeNewSpacers = (): number => {
    const spacers = rootEl.querySelectorAll(".transition-spacer");
    let added = 0;
    spacers.forEach((spacer) => {
      if (!observedSpacers.has(spacer)) {
        spacerObserver.observe(spacer);
        observedSpacers.add(spacer);
        added++;
      }
    });
    if (added > 0) {
      console.log(`[PageObserver] Observed ${added} new spacers. Total: ${observedSpacers.size}`);
    }
    return added;
  };

  const cleanupRemovedSpacers = (): number => {
    let removed = 0;
    const toDelete: Element[] = [];
    observedSpacers.forEach((spacer) => {
      if (!spacer.isConnected) {
        spacerObserver.unobserve(spacer);
        toDelete.push(spacer);
        removed++;
      }
    });
    toDelete.forEach((s) => observedSpacers.delete(s));
    if (removed > 0) {
      console.log(`[PageObserver] Cleaned up ${removed} removed spacers. Total observed: ${observedSpacers.size}`);
    }
    return removed;
  };

  const cleanup = () => {
    spacerObserver.disconnect();
    observer.disconnect();
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("orientationchange", handleOrientationChange);
    window.removeEventListener("navigationComplete", handleNavigationComplete);
    window.removeEventListener("scrollIndicatorClicked", handleScrollIndicatorClicked);

    hideScrollIndicator();

    if (DEV_ZONE_VISUALIZERS_ENABLED) {
      hideVisualizer(activeElementVisualizer);
      hideVisualizer(rangeVisualizer);
    }
  };

  if (paragraphsToObserve.length === 0) {
    console.warn("No paragraphs found to observe (selector: 'section[data-chapter] [data-index]').");
    window.removeEventListener("scrollIndicatorClicked", handleScrollIndicatorClicked);
    return null;
  } else {
    paragraphsToObserve.forEach((paragraph) => {
      observer.observe(paragraph);
      observedParagraphs.add(paragraph);
    });

    return { observer, observeNewParagraphs, cleanupRemovedParagraphs, observeNewSpacers, cleanupRemovedSpacers, cleanup };
  }
}
