import { setCurrentLocation } from "@/helpers/paragraphsNavigation";

const SHOULD_SHOW_EVERYONE = false;

// --- Helper Functions ---

/**
 * Checks if a given chapter and paragraph index falls within the specified range.
 */
function isInRange(currentChapter: number, currentParagraph: number, startChapter: number, startParagraph: number, endChapter: number, endParagraph: number): boolean {
  // Single chapter range
  if (startChapter === endChapter) {
    return currentChapter === startChapter && currentParagraph >= startParagraph && currentParagraph <= endParagraph;
  }

  // Multi-chapter range
  if (currentChapter === startChapter && currentParagraph >= startParagraph) {
    return true; // In the first chapter, at or after the start paragraph
  }
  if (currentChapter > startChapter && currentChapter < endChapter) {
    return true; // In a middle chapter
  }
  if (currentChapter === endChapter && currentParagraph <= endParagraph) {
    return true; // In the last chapter, at or before the end paragraph
  }

  return false;
}

/**
 * Normalizes the src to always be PNG and removes "speaks" or "listens" suffixes
 */
function normalizeSrcForInlineAvatar(src: string): string {
  if (!src) return src;

  // Remove "-speaks" or "-listens" (including the dash) that appears before the file extension
  let normalizedSrc = src.replace(/-(speaks|listens)(?=\.|$)/, "");

  // Ensure it ends with .png
  if (!normalizedSrc.endsWith(".png")) {
    // Remove any existing extension and add .png
    normalizedSrc = normalizedSrc.replace(/\.[^.]*$/, "") + ".png";
  }

  return normalizedSrc;
}

/**
 * Creates and configures a video or image element based on the placeholder span's data.
 */
function createMediaElement(
  placeholder: HTMLSpanElement,
  openCharacterDetailsModal: (characterSlug: string, isTalking: boolean, src: string) => void,
): HTMLVideoElement | HTMLImageElement | null {
  const characterSlug = placeholder.dataset.character;
  const isTalking = placeholder.dataset.isTalking === "true";
  const talkingSrc = placeholder.dataset.srcTalking; // Can be video or image

  if (!characterSlug) return null;

  let element: HTMLVideoElement | HTMLImageElement | null = null;
  let finalSrc: string | undefined = undefined;

  // For inline avatars, always use PNG format
  if (isTalking && talkingSrc) {
    finalSrc = normalizeSrcForInlineAvatar(talkingSrc);
    // Always create image element for inline avatars
    element = document.createElement("img");
  }

  // Configure and return the element
  if (element && finalSrc) {
    element.addEventListener("click", () => {
      // Pass the original talkingSrc to the modal, not the normalized finalSrc
      openCharacterDetailsModal(characterSlug, isTalking, talkingSrc);
    });
    element.src = finalSrc;
    element.classList.add("inline-avatar");
    if (characterSlug) element.dataset.character = characterSlug; // Assign character data if available
    // Add basic error handling for loading
    element.onerror = () => console.error(`Failed to load media: ${element?.src}`);
    return element;
  }
  if (SHOULD_SHOW_EVERYONE) {
    console.warn("Failed to create media element for placeholder:", placeholder); // Should not happen ideally
  }
  return null;
}

function highlightCharacter(character: HTMLSpanElement, openCharacterDetailsModal: (characterSlug: string, isTalking: boolean, src: string) => void) {
  const characterSlug = character.dataset.character;
  const listeningSrc = character.dataset.srcListening;
  const isTalking = character.dataset.isTalking === "true";

  // Check if a listener has already been attached
  if (character.dataset.clickListenerAttached === "true") {
    return;
  }

  character.classList.add("character-highlighted-activated");
  character.addEventListener("click", () => {
    openCharacterDetailsModal(characterSlug, isTalking, listeningSrc);
  });

  // Add hover functionality to show floating avatar
  character.addEventListener("mouseover", () => {
    // Create floating avatar container
    const floatingAvatar = document.createElement("div");
    floatingAvatar.classList.add("floating-avatar");
    floatingAvatar.style.position = "fixed";
    floatingAvatar.style.zIndex = "1000";
    floatingAvatar.style.opacity = "0";
    floatingAvatar.style.transition = "opacity 500ms ease-in-out";

    // Get trigger element's position
    const triggerRect = character.getBoundingClientRect();

    // Create media element based on source type
    if (listeningSrc) {
      // Normalize the src for consistent PNG format
      const normalizedSrc = normalizeSrcForInlineAvatar(listeningSrc);

      let mediaElement: HTMLVideoElement | HTMLImageElement;
      if (normalizedSrc.toLowerCase().endsWith(".png")) {
        // Create image element
        mediaElement = document.createElement("img");
      } else {
        // Create video element
        mediaElement = document.createElement("video");
        mediaElement.autoplay = true;
        mediaElement.loop = true;
        mediaElement.muted = true;
        mediaElement.playsInline = true;
      }

      mediaElement.src = normalizedSrc;
      mediaElement.classList.add("avatar-preview");

      floatingAvatar.appendChild(mediaElement);
      document.body.appendChild(floatingAvatar);

      // Position the floating avatar relative to the trigger element
      floatingAvatar.style.left = `${triggerRect.right + 10}px`; // 10px to the right of the trigger
      floatingAvatar.style.top = `${triggerRect.top + triggerRect.height / 2 - floatingAvatar.offsetHeight / 2}px`; // Vertically centered with the trigger, adjust as needed

      // Fade in
      setTimeout(() => {
        floatingAvatar.style.opacity = "1";
      }, 10);

      // Handle mouseout
      const handleMouseOut = () => {
        // Fade out
        floatingAvatar.style.opacity = "0";

        // Remove after transition completes
        setTimeout(() => {
          document.body.removeChild(floatingAvatar);
          // document.removeEventListener("mousemove", handleMouseMove);
        }, 500);

        character.removeEventListener("mouseout", handleMouseOut);
      };

      character.addEventListener("mouseout", handleMouseOut);
    }
  });

  // Mark that a listener has been attached
  character.dataset.clickListenerAttached = "true";
}

/**
 * Manages media loading and playback for paragraphs within the visible range.
 */
function activateMediaInRange(
  startChapter: number,
  startParagraph: number,
  endChapter: number,
  endParagraph: number,
  openCharacterDetailsModal: (characterSlug: string, isTalking: boolean, src: string) => void,
) {
  const allParagraphs = document.querySelectorAll<HTMLElement>("section[data-chapter] [data-index]");

  allParagraphs.forEach((p) => {
    const chapterElement = p.closest("section[data-chapter]") as HTMLElement;
    const chapterStr = chapterElement?.dataset.chapter;
    const paragraphStr = p.dataset.index;

    if (chapterStr && paragraphStr) {
      const currentChapter = parseInt(chapterStr, 10);
      const currentParagraph = parseInt(paragraphStr, 10);
      const inView = isInRange(currentChapter, currentParagraph, startChapter, startParagraph - 3, endChapter, endParagraph + 12);
      const placeholders = p.querySelectorAll<HTMLSpanElement>(".character-placeholder");

      const charactersDisplayed = [];
      placeholders.forEach((placeholder) => {
        const mediaInjected = placeholder.dataset.mediaInjected === "true";
        // Query for either video or image with the class OR the dummy placeholder
        let mediaElement = placeholder.querySelector<HTMLVideoElement | HTMLImageElement>("video.inline-avatar, img.inline-avatar");
        const dummyPlaceholder = placeholder.querySelector<HTMLSpanElement>(".dummy-avatar-placeholder");
        if (inView) {
          if (dummyPlaceholder) {
            // Found a dummy, replace it with actual media
            const newMediaElement = createMediaElement(placeholder, openCharacterDetailsModal);
            if (newMediaElement) {
              placeholder.replaceChild(newMediaElement, dummyPlaceholder);
              placeholder.dataset.mediaInjected = "true"; // Mark as injected
              mediaElement = newMediaElement; // Update mediaElement reference

              // NOTE: Text was already hidden when media was first injected,
              // and remains hidden while the dummy is shown. No action needed here.

              // Play video if applicable
              if (mediaElement instanceof HTMLVideoElement) {
                mediaElement.play().catch((e) => console.warn("Video play interrupted or failed:", e));
              }
              console.log(`[Media Inject] Replaced dummy with media for ${placeholder.dataset.character} in ${currentChapter}:${currentParagraph}`);
            }
          } else if (!mediaInjected) {
            // No dummy and no media injected yet, inject for the first time
            const newMediaElement = createMediaElement(placeholder, openCharacterDetailsModal);
            if (newMediaElement) {
              mediaElement = newMediaElement; // Update mediaElement reference
              // Hide original text content if it's a mention
              if (placeholder.classList.contains("character-mention") && placeholder.firstChild && placeholder.firstChild.nodeType === Node.TEXT_NODE) {
                const textNode = placeholder.firstChild as Text;
                const wrapper = document.createElement("span");
                wrapper.style.display = "none"; // Hide the text
                wrapper.setAttribute("data-original-text", "true");
                wrapper.textContent = textNode.textContent;
                placeholder.replaceChild(wrapper, textNode);
              }
              placeholder.appendChild(mediaElement); // Append media
              placeholder.dataset.mediaInjected = "true"; // Mark as injected

              // Play video if applicable
              if (mediaElement instanceof HTMLVideoElement) {
                mediaElement.play().catch((e) => console.warn("Video play interrupted or failed:", e));
              }
              console.log(`[Media Inject] Injected media for ${placeholder.dataset.character} in ${currentChapter}:${currentParagraph}`);
            }
          } else if (mediaElement instanceof HTMLVideoElement && mediaElement.paused) {
            // Media already injected, just play existing video if paused
            mediaElement.play().catch((e) => console.warn("Video play interrupted or failed:", e));
          }
        } else {
          // Out of view
          // Check if actual media is injected (not a dummy)
          if (mediaInjected && mediaElement) {
            // Create dummy placeholder
            const dummyElement = document.createElement("span");
            // Add classes for styling (assuming CSS defines size, display, etc.)
            dummyElement.classList.add("dummy-avatar-placeholder");
            // Add inline-avatar if it helps with consistent styling (like margins, alignment)
            if (mediaElement.classList.contains("inline-avatar")) {
              dummyElement.classList.add("inline-avatar");
            }
            // Ensure necessary styles for sizing and alignment are present, either via CSS or inline
            dummyElement.style.display = "inline-block"; // Needed to respect width/height
            dummyElement.style.verticalAlign = mediaElement.style.verticalAlign || "bottom"; // Match original or default

            // Replace media with dummy
            placeholder.replaceChild(dummyElement, mediaElement);
            delete placeholder.dataset.mediaInjected; // Mark as not injected (dummy is present)

            // NOTE: Text remains hidden in its wrapper span. No need to restore/re-hide.

            console.log(`[Media Unload] Replaced media with dummy for ${placeholder.dataset.character} in ${currentChapter}:${currentParagraph}`);
          } else {
            // We are out of view, and it's NOT (mediaInjected && mediaElement is valid)
            // `dummyPlaceholder` was queried at the start of the loop for this placeholder.
            if (!dummyPlaceholder && placeholder.dataset.isTalking === "true") {
              const newDummyElement = document.createElement("span");
              newDummyElement.classList.add("dummy-avatar-placeholder");
              newDummyElement.classList.add("inline-avatar");
              newDummyElement.style.display = "inline-block";
              newDummyElement.style.verticalAlign = "bottom";

              placeholder.appendChild(newDummyElement);

              // Ensure mediaInjected is false, as we are showing a dummy or no media was ever injected.
              if (placeholder.dataset.mediaInjected === "true") {
                delete placeholder.dataset.mediaInjected;
              }
            }
          }
        }
        charactersDisplayed.push(placeholder.dataset.character);
      });
      const charactersToHighlight = p.querySelectorAll<HTMLSpanElement>(".character-highlighted");
      const seenCharactersInParentP = new Set<string>();

      charactersToHighlight.forEach((character) => {
        const charText = character.dataset.character;
        if (charText && !seenCharactersInParentP.has(charText) && !charactersDisplayed.includes(charText)) {
          seenCharactersInParentP.add(charText);
          highlightCharacter(character, openCharacterDetailsModal);
        }
      });
    }
  });
}

function getScrollMarginTopPx(): number {
  const element = document.querySelector("#content-container p");
  if (!element) return 0;

  const landscapeMediaQuery = window.matchMedia("screen and (orientation: landscape) and (max-width: 1024px)");
  if (landscapeMediaQuery.matches) {
    return 30;
  }

  // Assuming 'line-height: 1.6;' for 'p' elements (as per file_context_2),
  // 1em (font-size of p) = lineHeight / 1.6.
  // So, 6em = 6 * (lineHeight / 1.6) = (6 / 1.6) * lineHeight = 3.75 * lineHeight.
  return 130;
}

// --- Extract Chapter and Paragraph Info ---
const getParagraphInfo = (element: Element): { chapter: number | null; paragraph: number | null } => {
  const paragraphStr = (element as HTMLElement).dataset.index;
  const chapterElement = element.closest("section[data-chapter]");
  const chapterStr = chapterElement ? (chapterElement as HTMLElement).dataset.chapter : null;
  return { chapter: chapterStr ? parseInt(chapterStr) : null, paragraph: paragraphStr ? parseInt(paragraphStr) : null };
};

export function setupPageObserver(
  openCharacterDetailsModal: (characterSlug: string, isTalking: boolean, src: string) => void,
): { observer: IntersectionObserver; observeNewParagraphs: () => number; cleanupRemovedParagraphs: () => number } | null {
  const observerOptions = { root: document.getElementById("content-container"), rootMargin: "0px", threshold: [0.1, 0.25, 0.5, 0.75, 0.8, 0.9, 0.95] };

  // --- State for tracking all currently intersecting pages ---
  const intersectingPages = new Set<Element>();
  let currentlyActivePageElement: Element | null = null;
  let currentlyLastActivePageElement: Element | null = null;
  let currentlyActiveParagraph: { chapter: number; paragraph: number } | null = null;

  // Keep track of observed paragraphs to avoid re-observing
  const observedParagraphs = new Set<Element>();

  // ----------------------------------------------------------
  const observer = new IntersectionObserver((entries) => {
    const scrollMarginTopPx = getScrollMarginTopPx();

    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        intersectingPages.add(entry.target);
      } else {
        intersectingPages.delete(entry.target);
      }
    });

    const rootRect = observerOptions.root.getBoundingClientRect();
    const zoneTop = rootRect.top + scrollMarginTopPx;
    const zoneBottom = zoneTop + 0.1 * rootRect.height; // 10% height below this point

    // --- Development Zone Visualizer ---

    console.log("WILCZYNSKA: 276 zoneTop", zoneTop);
    console.log("WILCZYNSKA: 277 zoneBottom", zoneBottom);
    console.log("WILCZYNSKA: 278 rootRect", rootRect);
    console.log("WILCZYNSKA: 279 scrollMarginTopPx", scrollMarginTopPx);

    let activeParagraph: { chapter: number | null; paragraph: number | null } | null = null;
    let maxPercentageOverlapRatio = -1;
    let chosenElement: Element | null = null;
    let foundFullyVisible = false;
    // Minimum overlap threshold in pixels to consider an element
    const MIN_OVERLAP_THRESHOLD = 20;

    // First pass: look for fully visible elements
    intersectingPages.forEach((element) => {
      const rect = element.getBoundingClientRect();
      // Check if element is fully contained within the zone
      if (rect.top >= zoneTop && rect.bottom <= zoneBottom) {
        // Element is fully visible in the zone
        if (!foundFullyVisible) {
          // This is the first fully visible element found
          foundFullyVisible = true;
          activeParagraph = getParagraphInfo(element);
          chosenElement = element;
          maxPercentageOverlapRatio = 1.0; // 100% visible
        }
      }
    });

    // Only proceed to second pass if no fully visible elements were found
    if (!foundFullyVisible) {
      let maxAbsoluteOverlap = 0; // Track the maximum absolute pixel overlap

      intersectingPages.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const overlapTop = Math.max(rect.top, zoneTop);
        const overlapBottom = Math.min(rect.bottom, zoneBottom);
        const overlap = Math.max(0, overlapBottom - overlapTop);

        // Skip elements with minimal overlap
        if (overlap < MIN_OVERLAP_THRESHOLD) return;

        const elementHeight = rect.height;
        let currentOverlapRatio = 0;

        if (elementHeight > 0) {
          currentOverlapRatio = overlap / elementHeight;
        }

        // Use a weighted combination of absolute overlap and percentage overlap
        // This gives preference to elements that occupy more space in the zone
        // while still considering how much of the element is visible
        const ABSOLUTE_WEIGHT = 0.7;
        const PERCENTAGE_WEIGHT = 0.3;

        const zoneHeight = zoneBottom - zoneTop;
        const normalizedAbsoluteOverlap = overlap / zoneHeight; // Normalize to 0-1 range
        const weightedScore = normalizedAbsoluteOverlap * ABSOLUTE_WEIGHT + currentOverlapRatio * PERCENTAGE_WEIGHT;

        if (weightedScore > maxPercentageOverlapRatio) {
          maxPercentageOverlapRatio = weightedScore;
          maxAbsoluteOverlap = overlap;
          activeParagraph = getParagraphInfo(element);
          chosenElement = element;
        }
      });

      console.log("WILCZYNSKA: Absolute overlap of selected element:", maxAbsoluteOverlap);
    }

    console.log(
      "WILCZYNSKA: 298 activeParagraph",
      currentlyActiveParagraph,
      activeParagraph,
      maxPercentageOverlapRatio,
      chosenElement,
      foundFullyVisible ? "fully-visible" : "partial",
    );

    document.querySelectorAll(".active-paragraph").forEach((element) => {
      element.classList.remove("active-paragraph");
    });
    chosenElement?.classList.add("active-paragraph");

    const topMultiplier = 0.05;
    let bottomMultiplier = 0.5;

    // Check media query for landscape mode on smaller wide screens
    const landscapeMediaQuery = window.matchMedia("screen and (orientation: landscape) and (max-width: 1400px)");
    if (landscapeMediaQuery.matches) {
      bottomMultiplier = 0.95; // Use larger bottom zone in this mode
    }

    const focusZoneTop = rootRect.top + rootRect.height * topMultiplier;
    const focusZoneBottom = rootRect.top + rootRect.height * bottomMultiplier;
    // let zoneVisualizer = document.getElementById("dev-zone-visualizer");
    // if (!zoneVisualizer) {
    //   zoneVisualizer = document.createElement("div");
    //   zoneVisualizer.id = "dev-zone-visualizer";
    //   document.body.appendChild(zoneVisualizer);
    // }
    // zoneVisualizer.style.left = `${rootRect.left}px`;
    // zoneVisualizer.style.top = `${focusZoneTop}px`;
    // zoneVisualizer.style.width = `${rootRect.width}px`;
    // zoneVisualizer.style.height = `${focusZoneBottom - focusZoneTop}px`;

    if (intersectingPages.size > 0) {
      // Default multipliers

      // Filter intersecting pages to find those overlapping the focus zone
      const focusedPages = Array.from(intersectingPages).filter((element) => {
        const elementRect = element.getBoundingClientRect();
        // Check if element's vertical range overlaps with the focus zone
        return elementRect.top < focusZoneBottom && elementRect.bottom > focusZoneTop;
      });

      if (focusedPages.length > 0) {
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

        if (topElementChanged || bottomElementChanged || activeParagraphChanged) {
          console.log(`[Observer] Change detected. TopEl C: ${topElementChanged}, BotEl C: ${bottomElementChanged}, Pgh C: ${activeParagraphChanged}`);
          console.log(`[Observer] Prev Top Pgh: ${JSON.stringify(currentTopInfoFromState)}, New Top Pgh: ${JSON.stringify(newTopInfo)}`);
          console.log(`[Observer] Prev Bottom Pgh: ${JSON.stringify(currentBottomInfoFromState)}, New Bottom Pgh: ${JSON.stringify(newBottomInfo)}`);
          console.log(`[Observer] Prev Active Pgh: ${JSON.stringify(currentlyActiveParagraph)}, New Active Pgh: ${JSON.stringify(activeParagraph)}`);

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
            console.log(`[Observer] Updating notes for Ch ${startInfo.chapter}:${startInfo.paragraph} to Ch ${endInfo.chapter}:${endInfo.paragraph} (Focus Zone)`);
            console.log("setting current location from intersection (focus zone)", { chapter: startInfo.chapter, paragraph: startInfo.paragraph });

            setCurrentLocation({
              chapter: startInfo.chapter,
              paragraph: startInfo.paragraph,
              endChapter: endInfo.chapter,
              endParagraph: endInfo.paragraph,
              currentChapter: activeParagraph.chapter,
              currentParagraph: activeParagraph.paragraph,
            });

            activateMediaInRange(startInfo.chapter, startInfo.paragraph, endInfo.chapter, endInfo.paragraph, openCharacterDetailsModal);
          } else {
            console.warn("[Observer] Could not update location: activeParagraph or start/end info is invalid.", {
              activePgh: activeParagraph,
              startInfo: startInfo,
              endInfo: endInfo,
            });
          }
        } else {
          console.log(`[Observer] No relevant change detected in active/boundary elements or paragraph. Skipping update.`);
        }
      } else {
        // Handle case where intersecting pages exist, but none are in the focus zone
        if (currentlyActivePageElement !== null) {
          console.log("[Observer] No pages intersecting the focus zone.");
          // Decide if you want to clear the active elements or keep the last known ones
          // currentlyActivePageElement = null;
          // currentlyLastActivePageElement = null;
          // updateParagraphNotes({ startChapter: null, startParagraph: null, endChapter: null, endParagraph: null }); // Example: Clear notes
        }
      }
    } else {
      // Handle case where no pages are intersecting the viewport at all
      if (currentlyActivePageElement !== null) {
        console.log("[Observer] No pages intersecting viewport.");
        // currentlyActivePageElement = null;
        // currentlyLastActivePageElement = null;
      }
    }
  }, observerOptions);

  // Function to observe new paragraphs
  const observeNewParagraphs = (): number => {
    const allParagraphs = document.querySelectorAll("section[data-chapter] [data-index]");
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
  const paragraphsToObserve = document.querySelectorAll("section[data-chapter] [data-index]");
  if (paragraphsToObserve.length === 0) {
    console.warn("No paragraphs found to observe (selector: 'section[data-chapter] [data-index]').");
    return null;
  } else {
    console.log(`GOZDECKI MAY 28 paragraphsToObserve.length`, paragraphsToObserve.length);
    paragraphsToObserve.forEach((paragraph) => {
      observer.observe(paragraph);
      observedParagraphs.add(paragraph);
    });

    return { observer, observeNewParagraphs, cleanupRemovedParagraphs };
  }
}
