import { setCurrentLocation } from "../helpers/paragraphsNavigation";

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
function createMediaElement(placeholder: HTMLSpanElement): HTMLVideoElement | HTMLImageElement | null {
  const character = placeholder.dataset.character;
  const isTalking = placeholder.dataset.isTalking === "true";
  const movingSrc = placeholder.dataset.srcMoving; // Can be video or image
  const pictureSrc = placeholder.dataset.srcPicture; // Can be video or image

  if (!character) return null;

  let element: HTMLVideoElement | HTMLImageElement | null = null;
  let finalSrc: string | undefined = undefined;

  // Determine the source and element type
  if (isTalking && movingSrc) {
    // Talking, use moving source
    finalSrc = movingSrc;
    if (movingSrc.toLowerCase().endsWith(".png")) {
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
  } else if (pictureSrc) {
    // Not talking (or no movingSrc), use picture source
    finalSrc = pictureSrc;
    if (pictureSrc.toLowerCase().endsWith(".png")) {
      // Picture source is an image
      element = document.createElement("img");
    } else {
      // Picture source is a video
      const video = document.createElement("video");
      video.autoplay = true; // Keep consistent attributes even for static video
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      element = video;
    }
  } else {
    // No source available
    console.warn("Could not determine media source for placeholder:", placeholder);
    return null;
  }

  // Configure and return the element
  if (element && finalSrc) {
    element.src = finalSrc;
    element.classList.add("inline-avatar");
    if (character) element.dataset.character = character; // Assign character data if available
    // Add basic error handling for loading
    element.onerror = () => console.error(`Failed to load media: ${element?.src}`);
    return element;
  }

  console.warn("Failed to create media element for placeholder:", placeholder); // Should not happen ideally
  return null;
}

/**
 * Manages media loading and playback for paragraphs within the visible range.
 */
function activateMediaInRange(startChapter: number, startParagraph: number, endChapter: number, endParagraph: number) {
  const allParagraphs = document.querySelectorAll<HTMLElement>("section[data-chapter] p[data-index]");

  allParagraphs.forEach((p) => {
    const chapterElement = p.closest("section[data-chapter]") as HTMLElement;
    const chapterStr = chapterElement?.dataset.chapter;
    const paragraphStr = p.dataset.index;

    if (chapterStr && paragraphStr) {
      const currentChapter = parseInt(chapterStr, 10);
      const currentParagraph = parseInt(paragraphStr, 10);
      const inView = isInRange(currentChapter, currentParagraph, startChapter, startParagraph, endChapter, endParagraph);
      const placeholders = p.querySelectorAll<HTMLSpanElement>(".character-placeholder");

      placeholders.forEach((placeholder) => {
        const mediaInjected = placeholder.dataset.mediaInjected === "true";
        // Query for either video or image with the class
        let mediaElement = placeholder.querySelector<HTMLVideoElement | HTMLImageElement>("video.inline-avatar, img.inline-avatar");

        if (inView) {
          if (!mediaInjected) {
            // Inject media
            mediaElement = createMediaElement(placeholder);
            if (mediaElement) {
              // If it's a mention, hide the original text content of the span before adding media
              if (placeholder.classList.contains("character-mention") && placeholder.firstChild && placeholder.firstChild.nodeType === Node.TEXT_NODE) {
                const textNode = placeholder.firstChild as Text;
                const wrapper = document.createElement("span");
                wrapper.style.display = "none"; // Hide the text
                wrapper.setAttribute("data-original-text", "true");
                wrapper.textContent = textNode.textContent;
                placeholder.replaceChild(wrapper, textNode);
              }
              placeholder.appendChild(mediaElement); // Append media
              placeholder.dataset.mediaInjected = "true"; // Use new dataset attribute

              // Only play if it's a video
              if (mediaElement instanceof HTMLVideoElement) {
                mediaElement.play().catch((e) => console.warn("Video play interrupted or failed:", e)); // Autoplay
              }
              console.log(`[Media Inject] Injected media for ${placeholder.dataset.character} in ${currentChapter}:${currentParagraph}`);
            }
          } else if (mediaElement instanceof HTMLVideoElement && mediaElement.paused) {
            // Play existing video if paused
            mediaElement.play().catch((e) => console.warn("Video play interrupted or failed:", e));
          }
        } else {
          // Out of view
          if (mediaInjected && mediaElement) {
            // No need to pause images, just remove the element
            placeholder.removeChild(mediaElement);
            delete placeholder.dataset.mediaInjected; // Use new dataset attribute
            // Restore original text if it was hidden (Optional, currently commented out in original code)
            // const hiddenText = placeholder.querySelector('span[data-original-text]');
            // if (hiddenText && hiddenText.parentNode === placeholder) {
            //     const textNode = document.createTextNode(hiddenText.textContent || '');
            //     placeholder.replaceChild(textNode, hiddenText);
            // }
            console.log(`[Media Unload] Unloaded media for ${placeholder.dataset.character} in ${currentChapter}:${currentParagraph}`);
          }
        }
      });
    }
  });
}

// Set up intersection observer to detect visible pages
export function setupPageObserver(): IntersectionObserver | null {
  // Threshold values for determining when a page is "visible enough"
  const observerOptions = {
    root: document.getElementById("content-container"),
    rootMargin: "0px",
    threshold: 0.05, // Adjust threshold if needed, maybe lower if elements are small
  };

  // Ensure the root element exists before creating the observer
  if (!observerOptions.root) {
    console.error("Observer root element 'content-container' not found. Cannot setup page observer.");
    return null; // Return null if root doesn't exist
  }

  // --- State for tracking all currently intersecting pages ---
  const intersectingPages = new Set<Element>();
  let currentlyActivePageElement: Element | null = null;
  let currentlyLastActivePageElement: Element | null = null;
  // ----------------------------------------------------------
  const observer = new IntersectionObserver((entries) => {
    // const rootElement = observerOptions.root; // root is guaranteed to exist here
    // if (!rootElement) { // No longer needed
    //   console.error("Observer root element not found:", observerOptions.root);
    //   return;
    // }
    console.log("entries", entries);

    // 1. Update the set of intersecting pages based on the current changes
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        intersectingPages.add(entry.target);
      } else {
        intersectingPages.delete(entry.target);
      }
    });

    // 2. Determine the elements within the "focus zone" (30%-60% vertically)
    if (intersectingPages.size > 0) {
      const rootRect = observerOptions.root.getBoundingClientRect();

      // Default multipliers
      let topMultiplier = 0.15;
      let bottomMultiplier = 0.65;

      // Check media query for landscape mode on smaller wide screens
      const landscapeMediaQuery = window.matchMedia("screen and (orientation: landscape) and (max-width: 1400px)");
      if (landscapeMediaQuery.matches) {
        topMultiplier = 0.05;
        bottomMultiplier = 0.95; // Use larger bottom zone in this mode
      }

      const focusZoneTop = rootRect.top + rootRect.height * topMultiplier;
      const focusZoneBottom = rootRect.top + rootRect.height * bottomMultiplier;

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

        // 3. Update active state only if the topmost or bottommost focused page has changed
        if (topFocusedPageElement !== currentlyActivePageElement || bottomFocusedPageElement !== currentlyLastActivePageElement) {
          console.log("[Observer] Top focused page:", topFocusedPageElement.id || topFocusedPageElement);
          console.log("[Observer] Bottom focused page:", bottomFocusedPageElement.id || bottomFocusedPageElement);

          currentlyActivePageElement = topFocusedPageElement;
          currentlyLastActivePageElement = bottomFocusedPageElement;

          // --- Extract Chapter and Paragraph Info ---
          const getParagraphInfo = (element: Element): { chapter: number | null; paragraph: number | null } => {
            const paragraphStr = (element as HTMLElement).dataset.index;
            const chapterElement = element.closest("section[data-chapter]");
            const chapterStr = chapterElement ? (chapterElement as HTMLElement).dataset.chapter : null;
            return { chapter: chapterStr ? parseInt(chapterStr) : null, paragraph: paragraphStr ? parseInt(paragraphStr) : null };
          };

          const startInfo = getParagraphInfo(topFocusedPageElement);
          const endInfo = getParagraphInfo(bottomFocusedPageElement);
          // -----------------------------------------

          // 4. Call update logic if we have valid info
          if (startInfo.chapter !== null && startInfo.paragraph !== null && endInfo.chapter !== null && endInfo.paragraph !== null) {
            console.log(`[Observer] Updating notes for Ch ${startInfo.chapter}:${startInfo.paragraph} to Ch ${endInfo.chapter}:${endInfo.paragraph} (Focus Zone)`);
            console.log("setting current location from intersection (focus zone)", { chapter: startInfo.chapter, paragraph: startInfo.paragraph });
            // Set current location based on the top element in the focus zone
            setCurrentLocation({ chapter: startInfo.chapter, paragraph: startInfo.paragraph, endChapter: endInfo.chapter, endParagraph: endInfo.paragraph });

            // --- Activate/Deactivate Media ---
            activateMediaInRange(startInfo.chapter, startInfo.paragraph, endInfo.chapter, endInfo.paragraph);
            // ----------------------------------
          } else {
            console.warn("[Observer] Could not extract chapter/paragraph info for focused elements:", topFocusedPageElement, bottomFocusedPageElement);
          }
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
        currentlyActivePageElement = null;
        currentlyLastActivePageElement = null;
        // Potentially clear notes or update state here
        // updateParagraphNotes({ startChapter: null, startParagraph: null, endChapter: null, endParagraph: null }); // Example: Clear notes
        // setCurrentLocation({ chapter: null, paragraph: null }); // Example: Clear location
      }
    }
  }, observerOptions);

  // Observe all paragraphs within chapter sections
  const paragraphsToObserve = document.querySelectorAll("section[data-chapter] [data-index]");
  if (paragraphsToObserve.length === 0) {
    console.warn("No paragraphs found to observe (selector: 'section[data-chapter] [data-index]').");
    // We still return the observer, it just won't observe anything initially.
  } else {
    paragraphsToObserve.forEach((paragraph) => {
      observer.observe(paragraph);
    });
  }

  return observer; // Return the created observer instance
}
