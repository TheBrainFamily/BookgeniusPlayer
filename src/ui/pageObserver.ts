import { setCurrentLocation, isSystemNavigationInProgress } from "@/helpers/paragraphsNavigation";
import { getBookData } from "@/genericBookDataGetters/getBookData";
import { pageWasJustReloaded } from "@/utils/pageWasJustReloaded";

const SHOULD_SHOW_EVERYONE = false;
const DEV_ZONE_VISUALIZERS_ENABLED = false;

// Cache isPlayFormat at module level to avoid repeated getBookData() calls
let cachedIsPlayFormat: boolean | null = null;

function getIsPlayFormat(): boolean {
  if (cachedIsPlayFormat === null) {
    const bookData = getBookData();
    cachedIsPlayFormat = bookData.metadata.bookForm === "play";
  }
  return cachedIsPlayFormat;
}

// --- Development Zone Visualizers ---

/**
 * Creates the main active element visualizer (dev-zone-visualizer)
 * Shows only the single active paragraph/heading
 */
function createActiveElementVisualizer(): HTMLDivElement {
  const visualizer = document.createElement("div");
  visualizer.id = "dev-zone-visualizer";
  visualizer.style.position = "fixed";
  visualizer.style.pointerEvents = "none";
  visualizer.style.zIndex = "45";
  visualizer.style.border = "2px solid #ff6b6b";
  visualizer.style.backgroundColor = "rgba(255, 107, 107, 0.1)";
  visualizer.style.opacity = "0";
  visualizer.style.transition = "opacity 0.3s ease-in-out";
  document.body.appendChild(visualizer);
  return visualizer;
}

/**
 * Creates the range visualizer (dev-zone-visualizer-2)
 * Shows all paragraphs that overlap with the focus zone
 */
function createRangeVisualizer(): HTMLDivElement {
  const visualizer = document.createElement("div");
  visualizer.id = "dev-zone-visualizer-2";
  visualizer.style.position = "fixed";
  visualizer.style.pointerEvents = "none";
  visualizer.style.zIndex = "44";
  visualizer.style.border = "2px solid #4ecdc4";
  visualizer.style.backgroundColor = "rgba(78, 205, 196, 0.1)";
  visualizer.style.opacity = "0";
  visualizer.style.transition = "opacity 0.5s ease-in-out";
  document.body.appendChild(visualizer);
  return visualizer;
}

/**
 * Initializes both development zone visualizers
 * Returns references to both visualizers or null if disabled
 */
function initializeDevZoneVisualizers(): { activeElementVisualizer: HTMLDivElement | null; rangeVisualizer: HTMLDivElement | null } {
  if (!DEV_ZONE_VISUALIZERS_ENABLED) {
    return { activeElementVisualizer: null, rangeVisualizer: null };
  }

  // Check if visualizers already exist to prevent duplicates
  let activeElementVisualizer = document.getElementById("dev-zone-visualizer") as HTMLDivElement;
  let rangeVisualizer = document.getElementById("dev-zone-visualizer-2") as HTMLDivElement;

  if (!activeElementVisualizer) {
    activeElementVisualizer = createActiveElementVisualizer();
  }

  if (!rangeVisualizer) {
    rangeVisualizer = createRangeVisualizer();
  }

  return { activeElementVisualizer, rangeVisualizer };
}

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
  openCharacterDetailsModal: (characterSlug: string, isVideo: boolean, src: string) => void,
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
    element.addEventListener("click", (e) => {
      // If this is a command-click (metaKey on Mac, ctrlKey on Windows), ignore
      if (e.metaKey || e.ctrlKey) {
        return;
      }
      e.stopPropagation();
      // Pass the original talkingSrc to the modal, not the normalized finalSrc
      openCharacterDetailsModal(characterSlug, !!talkingSrc && talkingSrc.endsWith(".mp4"), talkingSrc);
    });
    element.src = finalSrc;
    element.classList.add("inline-avatar");

    if (characterSlug) {
      // Assign character data if slug available
      element.dataset.character = characterSlug;
      element.title = characterSlug;
    }

    // Add basic error handling for loading
    element.onerror = () => console.error(`Failed to load media: ${element?.src}`);
    return element;
  }
  if (SHOULD_SHOW_EVERYONE) {
    console.warn("Failed to create media element for placeholder:", placeholder); // Should not happen ideally
  }
  return null;
}

export function highlightCharacter(character: HTMLSpanElement, openCharacterDetailsModal: (characterSlug: string, isVideo: boolean, src: string) => void) {
  const characterSlug = character.dataset.character;
  const listeningSrc = character.dataset.srcListening;

  // Check if a listener has already been attached
  if (character.dataset.clickListenerAttached === "true") {
    return;
  }

  let floatingAvatar: HTMLDivElement | null = null;
  character.classList.add("character-highlighted-activated");
  character.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey) {
      floatingAvatar?.remove();
      return;
    }
    // Find and remove any floating avatars to prevent them from sticking
    const floatingAvatars = document.querySelectorAll(".floating-avatar");
    floatingAvatars.forEach((avatar) => {
      document.body.removeChild(avatar);
    });

    openCharacterDetailsModal(characterSlug, !!listeningSrc && listeningSrc.endsWith(".mp4"), listeningSrc);
  });

  // Add hover functionality to show floating avatar
  character.addEventListener("mouseover", () => {
    // Create floating avatar container
    floatingAvatar = document.createElement("div");
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
      const avatarHeight = floatingAvatar.offsetHeight;
      const avatarWidth = floatingAvatar.offsetWidth;
      floatingAvatar.style.top = `${triggerRect.top - avatarHeight - 10}px`; // 10px above the trigger
      floatingAvatar.style.left = `${triggerRect.left + triggerRect.width / 2 - avatarWidth / 2}px`; // Horizontally centered with the trigger

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
  openCharacterDetailsModal: (characterSlug: string, isVideo: boolean, src: string) => void,
) {
  const allParagraphs = document.querySelectorAll<HTMLElement>("section[data-chapter] [data-index]");

  allParagraphs.forEach((p) => {
    const chapterElement = p.closest("section[data-chapter]") as HTMLElement;
    const chapterStr = chapterElement?.dataset.chapter;
    const paragraphStr = p.dataset.index;

    if (chapterStr && paragraphStr) {
      const currentChapter = parseInt(chapterStr, 10);
      const currentParagraph = parseInt(paragraphStr, 10);

      const inView = isInRange(currentChapter, currentParagraph, startChapter, startParagraph - 10, endChapter, endParagraph + 10);

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
            dummyElement.title = mediaElement.title || ""; // Preserve title if any

            // Replace media with dummy
            placeholder.replaceChild(dummyElement, mediaElement);
            delete placeholder.dataset.mediaInjected; // Mark as not injected (dummy is present)

            // NOTE: Text remains hidden in its wrapper span. No need to restore/re-hide.
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

// --- Extract Chapter and Paragraph Info ---
const getParagraphInfo = (element: Element): { chapter: number | null; paragraph: number | null } => {
  const paragraphStr = (element as HTMLElement).dataset.index;
  const chapterElement = element.closest("section[data-chapter]");
  const chapterStr = chapterElement ? (chapterElement as HTMLElement).dataset.chapter : null;
  return { chapter: chapterStr ? parseInt(chapterStr) : null, paragraph: paragraphStr ? parseInt(paragraphStr) : null };
};

let previousRootRectWidth = 0;

export function setupPageObserver(
  openCharacterDetailsModal: (characterSlug: string, isVideo: boolean, src: string) => void,
): { observer: IntersectionObserver; observeNewParagraphs: () => number; cleanupRemovedParagraphs: () => number; cleanup: () => void } | null {
  const observerOptions = { root: document.getElementById("content-container"), rootMargin: "0px", threshold: [0.1, 0.25, 0.5, 0.75, 0.8, 0.9, 0.95] };

  // Initialize development zone visualizers early
  const { activeElementVisualizer, rangeVisualizer } = initializeDevZoneVisualizers();

  // --- State for tracking all currently intersecting pages ---
  const intersectingPages = new Set<Element>();
  let currentlyActivePageElement: Element | null = null;
  let currentlyLastActivePageElement: Element | null = null;
  let currentlyActiveParagraph: { chapter: number; paragraph: number } | null = null;

  // Keep track of observed paragraphs to avoid re-observing
  const observedParagraphs = new Set<Element>();

  const processIntersections = () => {
    const rootRect = observerOptions.root.getBoundingClientRect();
    const topMultiplier = 0.35; // 35vh focus zone start
    let bottomMultiplier = 0.45; // 10vh focus zone height (default)

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
      bottomMultiplier = 0.55; // Larger zone for smaller screens
    }

    // Adjust for mobile portrait - ensure sufficient zone for chapter detection
    if (viewportWidth < 768 && viewportHeight > viewportWidth) {
      bottomMultiplier = 0.6; // Even larger zone for mobile portrait
    }

    // Adjust for very wide screens
    if (viewportWidth > 1600) {
      bottomMultiplier = 0.42; // Smaller, more precise zone for large screens
    }

    const focusZoneTop = rootRect.top + rootRect.height * topMultiplier;
    const focusZoneBottom = rootRect.top + rootRect.height * bottomMultiplier;

    if (rootRect.width !== previousRootRectWidth) {
      previousRootRectWidth = rootRect.width;
    }

    let activeParagraph: { chapter: number | null; paragraph: number | null } | null = null;
    let maxPercentageOverlapRatio = -1;
    let chosenElement: Element | null = null;
    let foundFullyVisible = false;
    // Minimum overlap threshold in pixels to consider an element
    const MIN_OVERLAP_THRESHOLD = 20;

    // First pass: look for fully visible elements
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

        // Use a weighted combination of absolute overlap and percentage overlap
        // This gives preference to elements that occupy more space in the zone
        // while still considering how much of the element is visible
        const ABSOLUTE_WEIGHT = 0.7;
        const PERCENTAGE_WEIGHT = 0.3;

        const zoneHeight = focusZoneBottom - focusZoneTop;
        const normalizedAbsoluteOverlap = overlap / zoneHeight; // Normalize to 0-1 range
        const weightedScore = normalizedAbsoluteOverlap * ABSOLUTE_WEIGHT + currentOverlapRatio * PERCENTAGE_WEIGHT;

        if (weightedScore > maxPercentageOverlapRatio) {
          maxPercentageOverlapRatio = weightedScore;
          activeParagraph = getParagraphInfo(element);
          chosenElement = element;
        }
      });
    }

    document.querySelectorAll(".active-paragraph").forEach((element) => {
      element.classList.remove("active-paragraph");
    });
    chosenElement?.classList.add("active-paragraph");

    // Update dev-zone-visualizer (single active element)
    if (chosenElement && activeElementVisualizer && DEV_ZONE_VISUALIZERS_ENABLED) {
      const updateVisualizerPosition = () => {
        requestAnimationFrame(() => {
          // Wait one more frame to ensure layout is completely stable
          requestAnimationFrame(() => {
            const elementRect = chosenElement.getBoundingClientRect();

            const computedStyle = window.getComputedStyle(chosenElement);
            const marginTop = parseFloat(computedStyle.marginTop);
            const marginBottom = parseFloat(computedStyle.marginBottom);
            const marginLeft = parseFloat(computedStyle.marginLeft);
            const marginRight = parseFloat(computedStyle.marginRight);

            const visualTop = elementRect.top - marginTop;
            const visualBottom = elementRect.bottom + marginBottom;
            const visualLeft = elementRect.left - marginLeft;
            const visualWidth = elementRect.width + marginLeft + marginRight;
            const visualHeight = visualBottom - visualTop;

            activeElementVisualizer.style.left = `${visualLeft}px`;
            activeElementVisualizer.style.top = `${visualTop}px`;
            activeElementVisualizer.style.width = `${visualWidth}px`;
            activeElementVisualizer.style.height = `${visualHeight}px`;
            activeElementVisualizer.style.opacity = "1";
          });
        });
      };

      updateVisualizerPosition();
    }

    if (intersectingPages.size > 0) {
      // Filter intersecting pages to find those overlapping the focus zone
      const focusedPages = Array.from(intersectingPages).filter((element) => {
        const elementRect = element.getBoundingClientRect();
        // Check if element's vertical range overlaps with the focus zone
        return elementRect.top < focusZoneBottom && elementRect.bottom > focusZoneTop;
      });

      if (focusedPages.length > 0) {
        // Update dev-zone-visualizer-2 with focused paragraphs
        if (rangeVisualizer && DEV_ZONE_VISUALIZERS_ENABLED) {
          const updateRangeVisualizerPosition = () => {
            requestAnimationFrame(() => {
              // Calculate the bounding box that encompasses all focused paragraphs
              let minTop = Infinity;
              let maxBottom = -Infinity;
              let minLeft = Infinity;
              let maxRight = -Infinity;

              focusedPages.forEach((element) => {
                const rect = element.getBoundingClientRect();
                const computedStyle = window.getComputedStyle(element);
                const marginTop = parseFloat(computedStyle.marginTop);
                const marginBottom = parseFloat(computedStyle.marginBottom);
                const marginLeft = parseFloat(computedStyle.marginLeft);
                const marginRight = parseFloat(computedStyle.marginRight);

                const visualTop = rect.top - marginTop;
                const visualBottom = rect.bottom + marginBottom;
                const visualLeft = rect.left - marginLeft;
                const visualRight = rect.right + marginRight;

                minTop = Math.min(minTop, visualTop);
                maxBottom = Math.max(maxBottom, visualBottom);
                minLeft = Math.min(minLeft, visualLeft);
                maxRight = Math.max(maxRight, visualRight);
              });

              // Position the range visualizer to encompass all focused paragraphs
              rangeVisualizer.style.left = `${minLeft}px`;
              rangeVisualizer.style.top = `${minTop}px`;
              rangeVisualizer.style.width = `${maxRight - minLeft}px`;
              rangeVisualizer.style.height = `${maxBottom - minTop}px`;
              rangeVisualizer.style.opacity = "1";
            });
          };

          updateRangeVisualizerPosition();
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
            // This ensures avatars remain visible not only for a current chapter, but previous or next chapter as well
            const allIntersectingParagraphs = Array.from(intersectingPages)
              .map((element) => getParagraphInfo(element))
              .filter((info) => info.chapter !== null && !isNaN(info.chapter) && info.paragraph !== null && !isNaN(info.paragraph))
              .sort((a, b) => {
                if (a.chapter !== b.chapter) return a.chapter - b.chapter;
                return a.paragraph - b.paragraph;
              });

            const RANGE_PADDING = 1;
            const isPlayFormat = getIsPlayFormat();

            const rangeStartInfo = startInfo;
            const rangeEndInfo = endInfo;

            let expandedStartParagraph = Math.max(1, rangeStartInfo.paragraph - RANGE_PADDING);
            const expandedEndParagraph = rangeEndInfo.paragraph + RANGE_PADDING;

            if (isPlayFormat && rangeStartInfo.paragraph <= 3) {
              expandedStartParagraph = 0;
            }

            // By default, update the hash.
            let shouldUpdateHash = true;

            // However, if system navigation was in progress, it means this is the
            // re-evaluation call after the initial scroll. In this case, we've
            // just landed where we want to be, so we should NOT update the hash
            // to avoid an unwanted jump (e.g., from 1-0 to 1-1).
            if (pageWasJustReloaded() || isSystemNavigationInProgress()) {
              shouldUpdateHash = false;
            }

            // Don't update location during system navigation to avoid conflicts with programmatic scrolling
            setCurrentLocation(
              {
                chapter: rangeStartInfo.chapter,
                paragraph: expandedStartParagraph,
                endChapter: rangeEndInfo.chapter,
                endParagraph: expandedEndParagraph,
                currentChapter: activeParagraph.chapter,
                currentParagraph: activeParagraph.paragraph,
              },
              { updateHash: shouldUpdateHash },
            );

            // Media uses viewport range (separate from character notes)
            if (allIntersectingParagraphs.length > 0) {
              const mediaStartInfo = allIntersectingParagraphs[0];
              const mediaEndInfo = allIntersectingParagraphs[allIntersectingParagraphs.length - 1];
              activateMediaInRange(mediaStartInfo.chapter, mediaStartInfo.paragraph, mediaEndInfo.chapter, mediaEndInfo.paragraph, openCharacterDetailsModal);
            } else {
              activateMediaInRange(startInfo.chapter, startInfo.paragraph, endInfo.chapter, endInfo.paragraph, openCharacterDetailsModal);
            }
          } else {
            console.warn("[Observer] Could not update location: activeParagraph or start/end info is invalid.", {
              activePgh: activeParagraph,
              startInfo: startInfo,
              endInfo: endInfo,
            });
          }
        }
      } else {
        // Handle case where intersecting pages exist, but none are in the focus zone
        if (rangeVisualizer && DEV_ZONE_VISUALIZERS_ENABLED) {
          rangeVisualizer.style.opacity = "0";
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
      if (rangeVisualizer && DEV_ZONE_VISUALIZERS_ENABLED) {
        rangeVisualizer.style.opacity = "0";
      }

      if (currentlyActivePageElement !== null) {
        // currentlyActivePageElement = null;
        // currentlyLastActivePageElement = null;
      }
    }
  };

  // ----------------------------------------------------------
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        intersectingPages.add(entry.target);
      } else {
        intersectingPages.delete(entry.target);
      }
    });

    processIntersections();
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
    paragraphsToObserve.forEach((paragraph) => {
      observer.observe(paragraph);
      observedParagraphs.add(paragraph);
    });

    return { observer, observeNewParagraphs, cleanupRemovedParagraphs, cleanup: () => {} };
  }
}
