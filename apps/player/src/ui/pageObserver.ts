import { setCurrentLocation, isSystemNavigationInProgress } from "@player/helpers/paragraphsNavigation";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import { getListeningMediaFilePathForName, getTalkingMediaFilePathForName } from "@player/utils/getFilePathsForName";
import { bookDataLoader } from "@player/services/bookDataLoader";
import { pageWasJustReloaded } from "@player/utils/pageWasJustReloaded";
import debounce from "lodash.debounce";
import { isVideoFile } from "@player/helpers/isVideoFile";
import { highlightCharacter } from "./highlightCharacter";
import { CharacterModalParams } from "@player/stores/modals/characterModal.store";

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

let isSplashAnimationComplete = false;

window.addEventListener(
  "splashHidden",
  () => {
    isSplashAnimationComplete = true;
  },
  { once: true },
);

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
export function normalizeSrcForInlineAvatar(src: string): string {
  if (!src) return src;

  // Preserve query/hash separately so we don't mangle them
  let pathPart = src;
  let query = "";
  let hash = "";

  const hashIdx = src.indexOf("#");
  if (hashIdx !== -1) {
    hash = src.slice(hashIdx);
    pathPart = src.slice(0, hashIdx);
  }

  const qIdx = pathPart.indexOf("?");
  if (qIdx !== -1) {
    query = pathPart.slice(qIdx);
    pathPart = pathPart.slice(0, qIdx);
  }

  // Split directory + filename
  const lastSlash = pathPart.lastIndexOf("/");
  const dir = lastSlash >= 0 ? pathPart.slice(0, lastSlash + 1) : "";
  let file = lastSlash >= 0 ? pathPart.slice(lastSlash + 1) : pathPart;

  // Remove "-speaks" or "-listens" only when they appear immediately before the final extension or at end
  file = file.replace(/-(speaks|listens)(?=(\.[^.\/]+$|$))/i, "");

  // Replace final extension with .png, or add .png if none
  if (/\.[^.\/]+$/.test(file)) {
    file = file.replace(/\.[^.\/]+$/, ".png");
  } else {
    file = `${file}.png`;
  }

  return `${dir}${file}${query}${hash}`;
}

/**
 * Updates video opacity based on talking state for inline avatars
 */
function updateVideoState(container: HTMLDivElement, isTalking: boolean) {
  const listeningVideo = container.querySelector('video[data-state="listens"]') as HTMLVideoElement;
  const speakingVideo = container.querySelector('video[data-state="speaks"]') as HTMLVideoElement;

  if (listeningVideo) {
    listeningVideo.style.opacity = isTalking ? "0" : "1";
  }

  if (speakingVideo) {
    speakingVideo.style.opacity = isTalking ? "1" : "0";
  }
}

/**
 * Creates a media container element with CharacterMedia-like structure for inline avatars.
 */
function createMediaElement(placeholder: HTMLSpanElement, openCharacterDetailsModal: (params: CharacterModalParams) => void, isPlayFormat: boolean): HTMLDivElement | null {
  const characterSlug = placeholder.dataset.character;
  const isTalking = placeholder.dataset.isTalking === "true";
  const talkingSrc = getTalkingMediaFilePathForName(characterSlug, bookDataLoader.getCurrentBook());
  const listeningSrc = getListeningMediaFilePathForName(characterSlug, bookDataLoader.getCurrentBook());

  if (!characterSlug) return null;

  // Create container element similar to CharacterMedia structure
  const container = document.createElement("div");
  container.classList.add("inline-avatar", "relative", "w-full", "h-full");
  container.dataset.character = characterSlug;
  container.title = characterSlug;

  // Create placeholder image (always shown as fallback)
  const placeholderImg = document.createElement("img");
  const placeholderSrc = (listeningSrc || talkingSrc || "").replace(/-(listens|speaks)\.(mp4|webm)$/, ".png");
  placeholderImg.src = normalizeSrcForInlineAvatar(placeholderSrc);
  placeholderImg.classList.add("absolute", "top-0", "left-0", "w-full", "h-full", "object-cover", "rounded-full");
  placeholderImg.alt = characterSlug;
  container.appendChild(placeholderImg);

  if (isPlayFormat && listeningSrc && isVideoFile(listeningSrc)) {
    // Create listening video
    const listeningVideo = document.createElement("video");
    listeningVideo.src = listeningSrc;
    listeningVideo.classList.add("absolute", "top-0", "left-0", "w-full", "h-full", "object-cover", "rounded-full", "transition-opacity", "duration-300", "ease-in-out");
    listeningVideo.autoplay = true;
    listeningVideo.loop = true;
    listeningVideo.muted = true;
    listeningVideo.playsInline = true;
    listeningVideo.dataset.state = "listens";

    // Initially show listening video
    listeningVideo.style.opacity = isTalking ? "0" : "1";
    container.appendChild(listeningVideo);

    // Create speaking video if available
    if (talkingSrc && isVideoFile(talkingSrc)) {
      const speakingVideo = document.createElement("video");
      speakingVideo.src = talkingSrc;
      speakingVideo.classList.add("absolute", "top-0", "left-0", "w-full", "h-full", "object-cover", "rounded-full", "transition-opacity", "duration-300", "ease-in-out");
      speakingVideo.autoplay = true;
      speakingVideo.loop = true;
      speakingVideo.muted = true;
      speakingVideo.playsInline = true;
      speakingVideo.dataset.state = "speaks";

      // Show speaking video only when talking
      speakingVideo.style.opacity = isTalking ? "1" : "0";
      container.appendChild(speakingVideo);

      // Store references for easy swapping
      container.dataset.hasVideos = "true";
    }

    // Handle video loading errors
    listeningVideo.onerror = () => {
      console.warn(`Failed to load listening video: ${listeningSrc}`);
      listeningVideo.style.display = "none";
    };

    if (talkingSrc && isVideoFile(talkingSrc)) {
      const speakingVideo = container.querySelector('video[data-state="speaks"]') as HTMLVideoElement;
      if (speakingVideo) {
        speakingVideo.onerror = () => {
          console.warn(`Failed to load speaking video: ${talkingSrc}`);
          speakingVideo.style.display = "none";
        };
      }
    }
  }

  // Add pointer handler to container (works for mouse and touch)
  container.addEventListener("pointerup", (e) => {
    if (e.metaKey || e.ctrlKey) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const currentIsTalking = placeholder.dataset.isTalking === "true";
    const videoSrc = currentIsTalking ? talkingSrc : listeningSrc;

    openCharacterDetailsModal({ characterSlug, isVideo: !videoSrc && isVideoFile(videoSrc), mediaSrc: videoSrc || "" });
  });

  return container;
}

/**
 * Manages media loading and playback for paragraphs within the visible range.
 */
function activateMediaInRange(
  startChapter: number,
  startParagraph: number,
  endChapter: number,
  endParagraph: number,
  openCharacterDetailsModal: (params: CharacterModalParams) => void,
  isPlayFormat: boolean,
) {
  const allParagraphs = document.querySelectorAll<HTMLElement>("section[data-chapter] [data-index]");

  const bufferSize = isPlayFormat ? 6 : 10;

  allParagraphs.forEach((p) => {
    const chapterElement = p.closest("section[data-chapter]") as HTMLElement;
    const chapterStr = chapterElement?.dataset.chapter;
    const paragraphStr = p.dataset.index;

    if (chapterStr && paragraphStr) {
      const currentChapter = parseInt(chapterStr, 10);
      const currentParagraph = parseInt(paragraphStr, 10);

      const inView = isInRange(currentChapter, currentParagraph, startChapter, startParagraph - bufferSize, endChapter, endParagraph + bufferSize);

      const playRow = p.closest(".play-row");
      const placeholders = (playRow ?? p).querySelectorAll<HTMLSpanElement>(".character-placeholder");

      const charactersDisplayed = [];
      placeholders.forEach((placeholder) => {
        const mediaInjected = placeholder.dataset.mediaInjected === "true";
        // Query for either video or image with the class OR the dummy placeholder
        let mediaElement = placeholder.querySelector<HTMLDivElement>("div.inline-avatar");
        const dummyPlaceholder = placeholder.querySelector<HTMLSpanElement>(".dummy-avatar-placeholder");
        if (inView) {
          if (dummyPlaceholder) {
            // Found a dummy, replace it with actual media
            const newMediaElement = createMediaElement(placeholder, openCharacterDetailsModal, isPlayFormat);
            if (newMediaElement) {
              placeholder.replaceChild(newMediaElement, dummyPlaceholder);
              placeholder.dataset.mediaInjected = "true"; // Mark as injected
              mediaElement = newMediaElement; // Update mediaElement reference

              // NOTE: Text was already hidden when media was first injected,
              // and remains hidden while the dummy is shown. No action needed here.

              // Play video if applicable
              if (newMediaElement) {
                const videos = newMediaElement.querySelectorAll("video");
                videos.forEach((video) => {
                  video.play().catch((e) => console.warn("Video play interrupted or failed:", e));
                });
              }
            }
          } else if (!mediaInjected) {
            // No dummy and no media injected yet, inject for the first time
            const newMediaElement = createMediaElement(placeholder, openCharacterDetailsModal, isPlayFormat);
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
              if (newMediaElement) {
                const videos = newMediaElement.querySelectorAll("video");
                videos.forEach((video) => {
                  video.play().catch((e) => console.warn("Video play interrupted or failed:", e));
                });
              }
            }
          } else if (mediaElement) {
            // Media already injected, update talking state and play videos if paused
            const currentIsTalking = placeholder.dataset.isTalking === "true";

            // Update video state based on current talking status
            if (mediaElement.dataset.hasVideos === "true") {
              updateVideoState(mediaElement, currentIsTalking);
            }

            // Check for videos and play if paused
            const videos = mediaElement.querySelectorAll("video");
            videos.forEach((video) => {
              if (video.paused) {
                video.play().catch((e) => console.warn("Video play interrupted or failed:", e));
              }
            });
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
            dummyElement.classList.add("relative");

            // Try to keep the same placeholder image visible in the dummy
            const existingImg = mediaElement.querySelector("img");
            if (existingImg) {
              const imgClone = existingImg.cloneNode(true) as HTMLImageElement;
              dummyElement.appendChild(imgClone);
            }

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
              newDummyElement.classList.add("relative");

              // Compute and add placeholder image so the avatar never appears empty
              const characterSlugForDummy = placeholder.dataset.character;
              if (characterSlugForDummy) {
                const talkingSrcForDummy = getTalkingMediaFilePathForName(characterSlugForDummy, bookDataLoader.getCurrentBook());
                const listeningSrcForDummy = getListeningMediaFilePathForName(characterSlugForDummy, bookDataLoader.getCurrentBook());
                const placeholderSrcForDummy = normalizeSrcForInlineAvatar(listeningSrcForDummy || talkingSrcForDummy || "");
                if (placeholderSrcForDummy) {
                  const img = document.createElement("img");
                  img.src = placeholderSrcForDummy;
                  img.classList.add("absolute", "top-0", "left-0", "w-full", "h-full", "object-cover", "rounded-full");
                  img.alt = characterSlugForDummy;
                  newDummyElement.appendChild(img);
                }
              }

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
export const getParagraphInfo = (element: Element): { chapter: number | null; paragraph: number | null } => {
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

let previousRootRectWidth = 0;

export function setupPageObserver(
  openCharacterDetailsModal: (params: CharacterModalParams) => void,
): { observer: IntersectionObserver; observeNewParagraphs: () => number; cleanupRemovedParagraphs: () => number; cleanup: () => void } | null {
  const rootEl = document.getElementById("content-container");
  if (!rootEl) {
    console.warn("[PageObserver] No #content-container - cannot create observer.");
    return null;
  }

  const observerOptions = { root: rootEl, rootMargin: "0px", threshold: [0.1, 0.25, 0.5, 0.75, 0.8, 0.9, 0.95] };

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

    rootEl.querySelectorAll(".active-paragraph").forEach((element) => {
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
              activateMediaInRange(mediaStartInfo.chapter, mediaStartInfo.paragraph, mediaEndInfo.chapter, mediaEndInfo.paragraph, openCharacterDetailsModal, isPlayFormat);
            } else {
              activateMediaInRange(startInfo.chapter, startInfo.paragraph, endInfo.chapter, endInfo.paragraph, openCharacterDetailsModal, isPlayFormat);
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

  const debouncedProcessIntersections = debounce(processIntersections, 50);

  // ----------------------------------------------------------
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        intersectingPages.add(entry.target);
      } else {
        intersectingPages.delete(entry.target);
      }
    });

    debouncedProcessIntersections();
  }, observerOptions);

  // Function to observe new paragraphs
  const observeNewParagraphs = (): number => {
    const allParagraphs = rootEl.querySelectorAll("section[data-chapter] > h3, section[data-chapter] [data-index]");
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
  const paragraphsToObserve = rootEl.querySelectorAll("section[data-chapter] > h3, section[data-chapter] [data-index]");

  const spacersToObserve = rootEl.querySelectorAll(".transition-spacer");
  console.log("Observing these spacers:", spacersToObserve);

  const spacerObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!isSplashAnimationComplete) return;

        const rect = entry.boundingClientRect;

        // Calculate how much of the spacer is visible
        const visibleTop = Math.max(0, rect.top);
        const visibleBottom = Math.min(window.innerHeight, rect.bottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const visibilityPercent = visibleHeight / rect.height;

        // Determine if spacer is entering from bottom or leaving from top
        if (entry.isIntersecting) {
          // Spacer is at least partially visible
          if (rect.top >= 0) {
            // Spacer is entering from bottom or fully in view
            if (visibilityPercent <= 0.5) {
              // 0-50% visible: keep full opacity
              rootEl.style.opacity = "1";
            } else if (visibilityPercent < 1) {
              // 50-99% visible: fade from 1 to 0
              const nextChapterStart = entry.target.getAttribute("data-next-chapter-start");

              setCurrentLocation({
                chapter: parseInt(nextChapterStart, 10),
                paragraph: 0,
                endChapter: parseInt(nextChapterStart, 10),
                endParagraph: 0,
                currentChapter: parseInt(nextChapterStart, 10),
                currentParagraph: 0,
              });

              const fadePercent = (visibilityPercent - 0.5) * 2;
              rootEl.style.opacity = (1 - fadePercent).toString();
            } else {
              // 100% visible: full transparency
              rootEl.style.opacity = "0";
            }
          } else {
            // Spacer is leaving from top (rect.top < 0)
            if (visibilityPercent >= 0.6) {
              // Still 50% or more visible: keep at 0
              rootEl.style.opacity = "0";
            } else {
              rootEl.style.opacity = "1";
            }
          }
        } else {
          // Spacer is completely out of view
          rootEl.style.opacity = "1";
        }
      });
    },
    { threshold: Array.from(Array(101).keys()).map((i) => i / 100) },
  );

  spacersToObserve.forEach((spacer) => {
    spacerObserver.observe(spacer);
  });

  if (paragraphsToObserve.length === 0) {
    console.warn("No paragraphs found to observe (selector: 'section[data-chapter] [data-index]').");
    return null;
  } else {
    paragraphsToObserve.forEach((paragraph) => {
      observer.observe(paragraph);
      observedParagraphs.add(paragraph);
    });

    return { observer, observeNewParagraphs, cleanupRemovedParagraphs, cleanup: () => observer.disconnect() };
  }
}
