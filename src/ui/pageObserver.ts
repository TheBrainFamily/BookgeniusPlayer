import { setCurrentLocation } from "@/helpers/paragraphsNavigation";
import debounce from "lodash.debounce";

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

  // Determine the source and element type
  if (isTalking) {
    // Talking, use moving source
    finalSrc = talkingSrc;
    if (talkingSrc.toLowerCase().endsWith(".png")) {
      // Moving source is an image
      element = document.createElement("img");
      // Add specific attributes for talking image if needed, otherwise uses common ones below
    } else {
      // Moving source is a video
      const video = document.createElement("video");
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      element = video;
    }
  }

  // Configure and return the element
  if (element && finalSrc) {
    element.addEventListener("click", () => {
      openCharacterDetailsModal(characterSlug, isTalking, finalSrc);
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
      let mediaElement: HTMLVideoElement | HTMLImageElement;
      if (listeningSrc.toLowerCase().endsWith(".png")) {
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

      mediaElement.src = listeningSrc;
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
  const observerOptions = { root: document.getElementById("content-container"), rootMargin: "0px", threshold: [0.1, 0.25, 0.5, 0.85] };

  const intersectingPages = new Set<Element>();
  let currentlyActivePageElement: Element | null = null;
  let currentlyLastActivePageElement: Element | null = null;
  let currentlyActiveParagraph: { chapter: number | null; paragraph: number | null } | null = null;

  const observedParagraphs = new Set<Element>();

  const debouncedUpdater = debounce(
    (
      activeParagraphForUpdate: { chapter: number; paragraph: number } | null,
      startInfoForUpdate: { chapter: number | null; paragraph: number | null } | null,
      endInfoForUpdate: { chapter: number | null; paragraph: number | null } | null,
      openModalFn: (characterSlug: string, isTalking: boolean, src: string) => void,
    ) => {
      if (
        activeParagraphForUpdate &&
        activeParagraphForUpdate.chapter !== null &&
        activeParagraphForUpdate.paragraph !== null &&
        startInfoForUpdate &&
        startInfoForUpdate.chapter !== null &&
        startInfoForUpdate.paragraph !== null &&
        endInfoForUpdate &&
        endInfoForUpdate.chapter !== null &&
        endInfoForUpdate.paragraph !== null
      ) {
        console.log(
          `[Observer DEBOUNCED] Updating notes for Ch ${startInfoForUpdate.chapter}:${startInfoForUpdate.paragraph} to Ch ${endInfoForUpdate.chapter}:${endInfoForUpdate.paragraph} (Focus Zone)`,
        );
        console.log("setting current location from DEBOUNCED intersection (focus zone)", { chapter: startInfoForUpdate.chapter, paragraph: startInfoForUpdate.paragraph });

        setCurrentLocation({
          chapter: startInfoForUpdate.chapter,
          paragraph: startInfoForUpdate.paragraph,
          endChapter: endInfoForUpdate.chapter,
          endParagraph: endInfoForUpdate.paragraph,
          currentChapter: activeParagraphForUpdate.chapter,
          currentParagraph: activeParagraphForUpdate.paragraph,
        });

        activateMediaInRange(startInfoForUpdate.chapter, startInfoForUpdate.paragraph, endInfoForUpdate.chapter, endInfoForUpdate.paragraph, openModalFn);
      } else {
        console.warn("[Observer DEBOUNCED] Could not update location: activeParagraph or start/end info is invalid.", {
          activePgh: activeParagraphForUpdate,
          startInfo: startInfoForUpdate,
          endInfo: endInfoForUpdate,
        });
      }
    },
    200,
    { maxWait: 500, leading: true },
  );

  const handleIntersection = (entries: IntersectionObserverEntry[]) => {
    const scrollMarginTopPx = getScrollMarginTopPx();

    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        intersectingPages.add(entry.target);
      } else {
        intersectingPages.delete(entry.target);
      }
    });

    const rootElement = observerOptions.root;
    if (!rootElement) {
      console.warn("[Observer IMMEDIATE] Root element not found for observer calculations.");
      return;
    }
    const rootRect = rootElement.getBoundingClientRect();
    const zoneTop = rootRect.top + scrollMarginTopPx;
    const zoneBottom = zoneTop + 0.1 * rootRect.height;

    let newActiveParagraphInfo: { chapter: number | null; paragraph: number | null } | null = null;
    let maxPercentageOverlapRatio = -1;
    let newChosenElement: Element | null = null;
    let newFoundFullyVisible = false;
    const MIN_OVERLAP_THRESHOLD = 20;

    intersectingPages.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.top >= zoneTop && rect.bottom <= zoneBottom) {
        if (!newFoundFullyVisible) {
          newFoundFullyVisible = true;
          newActiveParagraphInfo = getParagraphInfo(element);
          newChosenElement = element;
          maxPercentageOverlapRatio = 1.0;
        }
      }
    });

    if (!newFoundFullyVisible) {
      intersectingPages.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const overlapTop = Math.max(rect.top, zoneTop);
        const overlapBottom = Math.min(rect.bottom, zoneBottom);
        const overlap = Math.max(0, overlapBottom - overlapTop);

        if (overlap < MIN_OVERLAP_THRESHOLD) return;

        const elementHeight = rect.height;
        let currentOverlapRatio = 0;

        if (elementHeight > 0) {
          currentOverlapRatio = overlap / elementHeight;
        }

        const ABSOLUTE_WEIGHT = 0.7;
        const PERCENTAGE_WEIGHT = 0.3;
        const zoneHeight = zoneBottom - zoneTop;
        const normalizedAbsoluteOverlap = zoneHeight > 0 ? overlap / zoneHeight : 0; // Avoid division by zero
        const weightedScore = normalizedAbsoluteOverlap * ABSOLUTE_WEIGHT + currentOverlapRatio * PERCENTAGE_WEIGHT;

        if (weightedScore > maxPercentageOverlapRatio) {
          maxPercentageOverlapRatio = weightedScore;
          maxAbsoluteOverlap = overlap;
          newActiveParagraphInfo = getParagraphInfo(element);
          newChosenElement = element;
        }
      });
    }

    document.querySelectorAll(".active-paragraph").forEach((element) => {
      element.classList.remove("active-paragraph");
    });
    newChosenElement?.classList.add("active-paragraph");

    const topMultiplier = 0.05;
    let bottomMultiplier = 0.5;

    const landscapeMediaQuery = window.matchMedia("screen and (orientation: landscape) and (max-width: 1400px)");
    if (landscapeMediaQuery.matches) {
      bottomMultiplier = 0.95;
    }

    const focusZoneTop = rootRect.top + rootRect.height * topMultiplier;
    const focusZoneBottom = rootRect.top + rootRect.height * bottomMultiplier;

    let newTopFocusedPageElement: Element | null = null;
    let newBottomFocusedPageElement: Element | null = null;

    if (intersectingPages.size > 0) {
      const newFocusedPages = Array.from(intersectingPages).filter((element) => {
        const elementRect = element.getBoundingClientRect();
        return elementRect.top < focusZoneBottom && elementRect.bottom > focusZoneTop;
      });

      if (newFocusedPages.length > 0) {
        newFocusedPages.sort((a, b) => {
          return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        });
        newTopFocusedPageElement = newFocusedPages[0];
        newBottomFocusedPageElement = newFocusedPages[newFocusedPages.length - 1];
      }
    }

    const newTopInfo = newTopFocusedPageElement ? getParagraphInfo(newTopFocusedPageElement) : null;
    const newBottomInfo = newBottomFocusedPageElement ? getParagraphInfo(newBottomFocusedPageElement) : null;

    let activeParagraphChanged = false;
    if ((!currentlyActiveParagraph && newActiveParagraphInfo) || (currentlyActiveParagraph && !newActiveParagraphInfo)) {
      activeParagraphChanged = true;
    } else if (currentlyActiveParagraph && newActiveParagraphInfo) {
      if (currentlyActiveParagraph.chapter !== newActiveParagraphInfo.chapter || currentlyActiveParagraph.paragraph !== newActiveParagraphInfo.paragraph) {
        activeParagraphChanged = true;
      }
    }

    let topElementChanged = false;
    const currentTopInfoFromState = currentlyActivePageElement ? getParagraphInfo(currentlyActivePageElement) : null;
    if ((!newTopInfo && currentTopInfoFromState) || (newTopInfo && !currentTopInfoFromState)) {
      topElementChanged = true;
    } else if (newTopInfo && currentTopInfoFromState) {
      if (newTopInfo.chapter !== currentTopInfoFromState.chapter || newTopInfo.paragraph !== currentTopInfoFromState.paragraph) {
        topElementChanged = true;
      }
    }

    let bottomElementChanged = false;
    const currentBottomInfoFromState = currentlyLastActivePageElement ? getParagraphInfo(currentlyLastActivePageElement) : null;
    if ((!newBottomInfo && currentBottomInfoFromState) || (newBottomInfo && !currentBottomInfoFromState)) {
      bottomElementChanged = true;
    } else if (newBottomInfo && currentBottomInfoFromState) {
      if (newBottomInfo.chapter !== currentBottomInfoFromState.chapter || newBottomInfo.paragraph !== currentBottomInfoFromState.paragraph) {
        bottomElementChanged = true;
      }
    }

    if (topElementChanged || bottomElementChanged || activeParagraphChanged) {
      // Update persisted state with the NEW DOM element references and paragraph info for the next comparison cycle
      currentlyActivePageElement = newTopFocusedPageElement;
      currentlyLastActivePageElement = newBottomFocusedPageElement;
      currentlyActiveParagraph = newActiveParagraphInfo ? { chapter: newActiveParagraphInfo.chapter, paragraph: newActiveParagraphInfo.paragraph } : null;

      const activePghForDebounce =
        newActiveParagraphInfo && newActiveParagraphInfo.chapter !== null && newActiveParagraphInfo.paragraph !== null
          ? { chapter: newActiveParagraphInfo.chapter, paragraph: newActiveParagraphInfo.paragraph }
          : null;

      debouncedUpdater(activePghForDebounce, newTopInfo, newBottomInfo, openCharacterDetailsModal);
    }
  };

  const observer = new IntersectionObserver(handleIntersection, observerOptions);

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
