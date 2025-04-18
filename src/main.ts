import "./styles.css";
import "./globals.css";

import { isNightMode, setIsNightMode } from "@/src/helpers/setIsNightMode";
import { getCurrentPage, goToNextPage, goToPage, goToPreviousPage, setCurrentPage } from "@/src/helpers/pagesNavigation";
import { pagesToSkipFooterGeneration, romanNumeralPages, BOOK_SLUGS } from "@/src/consts";
import { isMobileCharactersVisible, toggleMobileCharacters } from "@/src/isMobileCharactersVisible";
import { startReactComponents } from "./react-components";
import { getCurrentBookSlug } from "./getCurrentBookSlug";
import { initSearchModal, showSearchModal, hideSearchModal, isSearchActive } from "./searchModal";

// Import the sidebar editor utilities
import { createEditableEntity, createEditablePageSummary, createEditableChapterSummary, createAddCharacterButton, addEditorStyles, isEditActive } from "./utils/sidebarEditor";
import { getParagraphRange, getParagraphRangePure, ParsedParagraphRange, parseParagraphRange } from "./fetchers/getParagraphRange";
import { getSavedLocation, goToParagraph, setCurrentLocation } from "./helpers/paragraphsNavigation";
import { initializeNoteLinkBlinking, setupNoteLinkBlinking } from "./annotationsHandling";
import { getPictureFilePathForName, getMovingPictureFilePathForName } from "./utils/getFilePathsForName";

const pageMetadataCache = {}; // Cache for page metadata
const imageCache = {}; // Cache to track which images have been preloaded
let isMobileNotesVisible = false; // Track if notes panel is open on mobile

// Number input state for page jumping
let typedPageNumber = "";
let pageInputTimeout: NodeJS.Timeout | null = null;
const PAGE_INPUT_DELAY = 400; // ms to wait after typing before jumping to page

// Page offset adjustment state
let isSettingPageNumber = false;
let pageOffsetInput = "";
let pageOffsetInputTimeout: NodeJS.Timeout | null = null;

// Touch state for swipe gestures
let touchStartX = 0;
let touchEndX = 0;
let touchCurrentX = 0;
let isSwiping = false;
let swipeStarted = false;

// DOM elements
const bookContainer = document.getElementById("book-container")!;
const loadingIndicator = document.getElementById("loading");
const pageNumberIndicator = document.getElementById("page-number-indicator")!;

// Character modal elements
const characterModal = document.getElementById("character-modal")!;
const characterModalClose = characterModal.querySelector(".modal-close")!;
const modalCharacterImage = document.getElementById("modal-character-image")!;
const modalCharacterName = document.getElementById("modal-character-name")!;
const removeCharacterButton = document.getElementById("remove-character-button")!;
const mapCharacterButton = document.getElementById("map-character-button")!;
const createImageButton = document.getElementById("create-image-button")!;

// Character details modal elements
const characterDetailsModal = document.getElementById("character-details-modal")!;
const characterDetailsModalClose = characterDetailsModal.querySelector(".modal-close")!;
const modalDetailsCharacterImage = document.getElementById("modal-details-character-image")!;
const modalDetailsCharacterName = document.getElementById("modal-details-character-name")!;
const modalDetailsCharacterSummary = document.getElementById("modal-details-character-summary")!;

// Mapping modal elements
const mappingModal = document.getElementById("mapping-modal")!;
const mappingModalClose = mappingModal.querySelector(".modal-close")!;
const sourceCharacterName = document.getElementById("source-character-name")!;
const characterGrid = document.getElementById("character-grid")!;
const cancelMappingButton = document.getElementById("cancel-mapping-button")!;
const confirmMappingButton = document.getElementById("confirm-mapping-button")!;

// Character interaction state
let currentCharacter: { name: string; imageUrl: string } | null = null;
let selectedCharacterForMapping: { name: string; imageUrl: string } | null = null;

// Function to check if the device is mobile
function isMobile() {
  return window.innerWidth <= 768;
}

// Toggle mobile notes panel
function toggleMobileNotes() {
  const leftNotes = document.getElementById("left-notes");
  const notesOverlay = document.getElementById("notes-overlay");
  if (!leftNotes) return;

  isMobileNotesVisible = !isMobileNotesVisible;
  leftNotes.classList.toggle("active", isMobileNotesVisible);

  // Add class to body when notes are visible
  document.body.classList.toggle("notes-visible", isMobileNotesVisible);

  // Toggle overlay
  if (notesOverlay) {
    notesOverlay.classList.toggle("active", isMobileNotesVisible);

    // Add click event to overlay to close notes when clicked (only once)
    if (isMobileNotesVisible) {
      const clickHandler = () => {
        toggleMobileNotes();
        notesOverlay.removeEventListener("click", clickHandler);
      };
      notesOverlay.addEventListener("click", clickHandler);
    }
  }
}

// Close mobile notes panel when clicking on the main content area
function setupMobileInteractions() {
  const contentContainer = document.getElementById("content-container");
  if (contentContainer) {
    contentContainer.addEventListener("click", () => {
      if (isMobile() && isMobileNotesVisible) {
        toggleMobileNotes();
      }
    });
  }
}

// Create a hidden container for preloaded images
function createImagePreloadContainer() {
  const existingContainer = document.getElementById("preloaded-images");
  if (existingContainer) return existingContainer;

  const container = document.createElement("div");
  container.id = "preloaded-images";
  container.style.position = "absolute";
  container.style.width = "0";
  container.style.height = "0";
  container.style.overflow = "hidden";
  container.style.visibility = "hidden";
  document.body.appendChild(container);
  return container;
}

// Function to preload images from metadata
function preloadImagesFromMetadata(metadataArray) {
  if (!metadataArray || !Array.isArray(metadataArray)) return;

  const preloadContainer = createImagePreloadContainer();

  metadataArray.forEach((pageData) => {
    if (pageData && pageData.metadata && pageData.metadata.notesForPage) {
      pageData.metadata.notesForPage.forEach((entity) => {
        if (entity.imageUrl && !imageCache[entity.imageUrl]) {
          // Create image element for preloading
          const img = new Image();
          img.src = entity.imageUrl;
          img.dataset.entityName = entity.canonicalName;
          img.style.width = "1px";
          img.style.height = "1px";

          // Mark this image as being preloaded
          imageCache[entity.imageUrl] = true;

          // Add to preload container
          preloadContainer.appendChild(img);

          // Remove from preload container after loaded (but keep in browser cache)
          img.onload = () => {
            // Image is now cached by browser, so we can remove the element
            preloadContainer.removeChild(img);
          };
        }
      });
    }
  });
}

// Initialize pages
function initializePages() {
  // Try to get existing note containers first
  // const existingLeftNotes = document.getElementById("left-notes");
  // const existingRightNotes = document.getElementById("right-notes");

  // // Store their contents if they exist
  // const leftNotesHTML = existingLeftNotes
  //   ? existingLeftNotes.innerHTML
  //   : `
  //       <h3>Left Notes</h3>
  //       <p>Loading notes...</p>
  //     `;

  // const rightNotesHTML = existingRightNotes
  //   ? existingRightNotes.innerHTML
  //   : `
  //       <h3>Page summary</h3>
  //       <p>Keep reading...</p>
  //     `;

  // // Create and add left notes container
  // const leftNotesDiv = document.createElement("div");
  // leftNotesDiv.className = "notes-container";
  // leftNotesDiv.id = "left-notes";
  // leftNotesDiv.innerHTML = leftNotesHTML;

  // Add close button for mobile
  if (isMobile()) {
    //TODO APRIL 14 check this mobile addition
    // const closeButton = document.createElement("button");
    // closeButton.className = "close-notes-button";
    // closeButton.innerHTML = "&times;";
    // closeButton.addEventListener("click", toggleMobileNotes);
    // leftNotesDiv.appendChild(closeButton);
  }

  // bookContainer.appendChild(leftNotesDiv);

  // Create all page elements
  // pagesContent.forEach((content, index) => {
  //   const actualIndex = index + addToIndex;
  //   const pageDiv = document.createElement("div");
  //   pageDiv.className = "page";
  //   pageDiv.id = `page-${actualIndex}`;
  //   pageDiv.innerHTML = content;

  //   // Add page number footer
  //   if (index > pagesToSkipFooterGeneration + 1) {
  //     const footer = document.createElement("div");
  //     footer.className = "page-footer";
  //     footer.textContent = parsePage(actualIndex);
  //     pageDiv.appendChild(footer);
  //   }

  //   // Add to content container
  //   contentContainer.appendChild(pageDiv);
  // });

  // Create and add right notes container (hidden on mobile)
  // const rightNotesDiv = document.createElement("div");
  // rightNotesDiv.className = "notes-container";
  // rightNotesDiv.id = "right-notes";
  // rightNotesDiv.innerHTML = rightNotesHTML;
  // bookContainer.appendChild(rightNotesDiv);

  // Set up intersection observer to detect visible pages
  setupPageObserver();

  // Set up mobile interactions
  setupMobileInteractions();
}

// Set up intersection observer to detect visible pages
function setupPageObserver() {
  // Threshold values for determining when a page is "visible enough"
  const observerOptions = {
    root: document.getElementById("content-container"),
    rootMargin: "0px",
    threshold: 0.05, // Adjust threshold if needed, maybe lower if elements are small
  };

  // --- State for tracking all currently intersecting pages ---
  const intersectingPages = new Set<Element>();
  let currentlyActivePageElement: Element | null = null;
  let currentlyLastActivePageElement: Element | null = null;
  // ----------------------------------------------------------
  const observer = new IntersectionObserver((entries) => {
    const rootElement = observerOptions.root;
    if (!rootElement) {
      console.error("Observer root element not found:", observerOptions.root);
      return;
    }

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
      const rootRect = rootElement.getBoundingClientRect();
      const focusZoneTop = rootRect.top + rootRect.height * 0.25;
      const focusZoneBottom = rootRect.top + rootRect.height * 0.65;

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

          // 4. Call updateParagraphNotes if we have valid info
          if (startInfo.chapter !== null && startInfo.paragraph !== null && endInfo.chapter !== null && endInfo.paragraph !== null) {
            console.log(`[Observer] Updating notes for Ch ${startInfo.chapter}:${startInfo.paragraph} to Ch ${endInfo.chapter}:${endInfo.paragraph} (Focus Zone)`);
            updateParagraphNotes({ startChapter: startInfo.chapter, startParagraph: startInfo.paragraph, endChapter: endInfo.chapter, endParagraph: endInfo.paragraph });
            console.log("setting current location from intersection (focus zone)", { chapter: startInfo.chapter, paragraph: startInfo.paragraph });
            // Set current location based on the top element in the focus zone
            setCurrentLocation({ chapter: startInfo.chapter, paragraph: startInfo.paragraph });
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
  document.querySelectorAll("section[data-chapter] p[data-index]").forEach((paragraph) => {
    observer.observe(paragraph);
  });
}

let updateNotesDebounce: NodeJS.Timeout | null = null;
async function updateParagraphNotes({
  startChapter,
  startParagraph,
  endChapter,
  endParagraph,
}: {
  startChapter: number;
  startParagraph: number;
  endChapter: number;
  endParagraph: number;
}) {
  if (updateNotesDebounce) {
    clearTimeout(updateNotesDebounce);
  } else {
    updateParagraphNotesInternal({ startChapter, startParagraph, endChapter, endParagraph });
  }
  updateNotesDebounce = setTimeout(() => {
    updateParagraphNotesInternal({ startChapter, startParagraph, endChapter, endParagraph });
  }, 100);
}

const dealWithAnnotations = ({
  startChapter,
  startParagraph,
  endChapter,
  endParagraph,
}: {
  startChapter: number;
  startParagraph: number;
  endChapter: number;
  endParagraph: number;
}) => {
  // Hide all footnote sections initially
  const allNotes = document.querySelectorAll<HTMLElement>("#right-notes-scrollable-container section");
  allNotes.forEach((note) => {
    note.style.display = "none";
  });

  // Select all paragraphs within chapter sections that have a data-index
  const allParagraphs = document.querySelectorAll("section[data-chapter] p[data-index]");
  let atLeastOneInRange = false;
  allParagraphs.forEach((paragraph) => {
    const paragraphElement = paragraph as HTMLElement;
    const sectionElement = paragraphElement.closest("section[data-chapter]") as HTMLElement | null;

    if (!sectionElement) return; // Skip if paragraph is not within a chapter section

    const paragraphChapter = parseInt(sectionElement.dataset.chapter || "-1");
    const currentParagraph = parseInt(paragraphElement.dataset.index || "-1");

    if (paragraphChapter < 0 || currentParagraph < 0) return; // Skip if data attributes are invalid

    // Check if the paragraph falls within the visible range
    let isInRange = false;
    if (startChapter === endChapter) {
      // Case 1: Single Chapter View
      isInRange = paragraphChapter === startChapter && currentParagraph >= startParagraph && currentParagraph <= endParagraph;
    } else {
      // Case 2: Multi-Chapter View
      const inStartChapter = paragraphChapter === startChapter && currentParagraph >= startParagraph;
      const inMiddleChapter = paragraphChapter > startChapter && paragraphChapter < endChapter;
      const inEndChapter = paragraphChapter === endChapter && currentParagraph <= endParagraph;
      isInRange = inStartChapter || inMiddleChapter || inEndChapter;
    }

    if (isInRange) {
      const annotations = paragraphElement.querySelectorAll<HTMLAnchorElement>(".link-note");

      annotations.forEach((annotation) => {
        const targetId = annotation.getAttribute("href")?.substring(1); // Get href like '#fn3' and remove '#'
        if (targetId) {
          atLeastOneInRange = true;

          const noteElement = document.getElementById(targetId);
          // Check if the note element exists and is within the scrollable container
          if (noteElement && noteElement.closest("#right-notes-scrollable-container")) {
            noteElement.style.display = "block";
          }
        }
      });
    }
  });

  const rightNotes = document.getElementById("right-notes");
  if (!atLeastOneInRange) {
    rightNotes.style.visibility = "hidden";
  } else {
    rightNotes.style.visibility = "visible";
  }
};

const legacyElement = document.getElementById("legacy");
const videoElement = document.getElementById("bg-video");

const dealWithBackground = ({ startChapter, startParagraph, endChapter, endParagraph }) => {
  const backgrounds = [
    { startChapter: 1, startParagraph: 11, file: "moving-background.mp4", endChapter: 1, endParagraph: 20 },
    { startChapter: 1, startParagraph: 21, file: "army.mp4", endChapter: 1, endParagraph: 40 },
    { startChapter: 3, startParagraph: 20, file: "background-sara.png", endChapter: 3, endParagraph: 30 },
    // Add more background definitions here if needed
  ];

  let backgroundApplied = false;

  for (const background of backgrounds) {
    if (
      startChapter === background.startChapter &&
      startParagraph <= background.endParagraph &&
      endChapter === background.endChapter &&
      endParagraph >= background.startParagraph
    ) {
      console.log("GOZDECKI IS APPLYING BACKGROUND", background);
      backgroundApplied = true;

      if (background.file.endsWith(".mp4")) {
        // Fade out ::after image
        legacyElement.style.setProperty("--opacity-after", "0");

        const newVideoSrc = `/Pharaon/${background.file}`;

        if (videoElement.getAttribute("src") !== newVideoSrc) {
          videoElement.style.opacity = "0"; // Fade out current video
          setTimeout(
            () => {
              videoElement.src = newVideoSrc;
              videoElement.load();
              videoElement.play();
              videoElement.style.opacity = "1"; // Fade in new video
            },
            parseFloat(getComputedStyle(videoElement).transitionDuration) * 1000,
          );
        } else {
          videoElement.style.opacity = "1"; // Video already loaded
        }
      } else if (background.file.endsWith(".png")) {
        // Fade out video
        videoElement.style.opacity = "0";
        setTimeout(
          () => {
            videoElement.pause();
            videoElement.removeAttribute("src");
          },
          parseFloat(getComputedStyle(videoElement).transitionDuration) * 1000,
        );

        // Set new image and fade in
        const newImageUrl = `url("/Pharaon/${background.file}")`;
        if (legacyElement.style.getPropertyValue("--bg-image-after") !== newImageUrl) {
          legacyElement.style.setProperty("--bg-image-after", newImageUrl);
        }
        legacyElement.style.setProperty("--opacity-after", "1");
      }

      break; // First matching background handled
    }
  }

  // Default state: fade out ::after and video
  if (!backgroundApplied) {
    legacyElement.style.setProperty("--opacity-after", "0");
    videoElement.style.opacity = "0";
    setTimeout(
      () => {
        videoElement.pause();
        videoElement.removeAttribute("src");
      },
      parseFloat(getComputedStyle(videoElement).transitionDuration) * 1000,
    );
  }
};
let previousCharacters: string[] = [];
let isUpdatingNotes = false; // Flag to prevent overlapping updates

async function updateParagraphNotesInternal({
  startChapter,
  startParagraph,
  endChapter,
  endParagraph,
}: {
  startChapter: number;
  startParagraph: number;
  endChapter: number;
  endParagraph: number;
}) {
  dealWithBackground({ startChapter, startParagraph, endChapter, endParagraph });
  dealWithAnnotations({ startChapter, startParagraph, endChapter, endParagraph });
  const leftNotes = document.getElementById("left-notes");
  if (!leftNotes) return;

  const paragraphs =
    import.meta.env.VITE_DEVELOPMENT === "true"
      ? await getParagraphRangePure({ bookSlug: getCurrentBookSlug(), startChapter: startChapter, startParagraph, endChapter: endChapter, endParagraph })
      : await getParagraphRange({ bookSlug: getCurrentBookSlug(), startChapter: startChapter, startParagraph, endChapter: endChapter, endParagraph });
  const currentCharactersData = parseParagraphRange(paragraphs);
  console.log("characters", currentCharactersData);

  const newCharacterNames = currentCharactersData.map((c) => c.canonicalName).sort(); // Sort for comparison
  const sortedPreviousCharacters = [...previousCharacters].sort(); // Sort previous too

  // Check if character list is identical (after sorting)
  if (newCharacterNames.length === sortedPreviousCharacters.length && newCharacterNames.every((c, index) => c === sortedPreviousCharacters[index])) {
    console.log("No change to characters, skipping notes update.");
    // Even if list is same, activation might need update if range changed
    activateCharacters(startChapter, startParagraph, getCurrentBookSlug(), endChapter, endParagraph, true);
    return;
  } else {
    console.log("Changes detected in characters.");
  }

  // --- Mobile logic remains unchanged ---
  if (isMobile()) {
    // ... (keep existing mobile code)
    // ... remember to update previousCharacters for mobile too
    previousCharacters = newCharacterNames; // Update cache for next comparison
    // ... (rest of mobile code)
    const notesTitle = `Notes for Ch ${startChapter}:${startParagraph} to Ch ${endChapter}:${endParagraph}`;
    const closeButton = `<button class="close-notes-button">&times;</button>`;
    leftNotes.innerHTML = `<h3>${notesTitle}</h3>${closeButton}`;
    const closeBtn = leftNotes.querySelector(".close-notes-button");
    if (closeBtn) {
      closeBtn.addEventListener("click", toggleMobileNotes);
    }
    createMobileCharacterStrip(currentCharactersData);

    currentCharactersData.forEach((entity) => {
      const entityDiv = createEditableEntity(entity);
      leftNotes.appendChild(entityDiv);
    });
    activateCharacters(startChapter, startParagraph, getCurrentBookSlug(), endChapter, endParagraph, true);
  } else {
    // --- Desktop Logic ---
    if (isUpdatingNotes) {
      console.log("Notes update already in progress, skipping.");
      return; // Don't start a new update if one is ongoing
    }
    isUpdatingNotes = true; // Set flag

    // Find differences
    const addedNames = newCharacterNames.filter((name) => !sortedPreviousCharacters.includes(name));
    const removedNames = sortedPreviousCharacters.filter((name) => !newCharacterNames.includes(name));

    const container = leftNotes.querySelector<HTMLElement>(".entity-notes-container");

    // --- Optimized Case: Single Character Added, None Removed ---
    if (addedNames.length === 1 && removedNames.length === 0 && container) {
      console.log("Optimized Update: Single character added -", addedNames[0]);
      const addedCharacterData = currentCharactersData.find((c) => c.canonicalName === addedNames[0]);

      if (addedCharacterData) {
        const existingNotes = Array.from(container.querySelectorAll<HTMLElement>(".entity-note"));

        // 1. FIRST: Record initial positions
        const firstPositions = new Map<HTMLElement, DOMRect>();
        existingNotes.forEach((note) => {
          firstPositions.set(note, note.getBoundingClientRect());
        });

        // Create new element and add it (initially invisible)
        const newEntityDiv = createEditableEntity(addedCharacterData);
        newEntityDiv.style.opacity = "0";
        newEntityDiv.style.transition = "none"; // Ensure no transition initially
        container.appendChild(newEntityDiv);

        // Update the cache *before* the next check
        previousCharacters = newCharacterNames;

        // 2. LAST: Wait for layout, then record final positions
        requestAnimationFrame(() => {
          const lastPositions = new Map<HTMLElement, DOMRect>();
          const allNotes = Array.from(container.querySelectorAll<HTMLElement>(".entity-note")); // Get all including new
          allNotes.forEach((note) => {
            lastPositions.set(note, note.getBoundingClientRect());
          });

          // 3. INVERT: Apply transforms to old elements
          existingNotes.forEach((note) => {
            const firstRect = firstPositions.get(note);
            const lastRect = lastPositions.get(note);
            if (firstRect && lastRect) {
              const deltaX = firstRect.left - lastRect.left;
              const deltaY = firstRect.top - lastRect.top;
              if (deltaX !== 0 || deltaY !== 0) {
                note.style.transition = "none"; // Disable transitions during inversion
                note.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
              }
            }
          });

          // 4. PLAY: Animate in the next frame/tick
          requestAnimationFrame(() => {
            existingNotes.forEach((note) => {
              note.style.transition = "transform 0.3s ease-out"; // Enable transform transition
              note.style.transform = ""; // Animate to natural position
            });

            // Fade in the new element by setting transition THEN opacity
            newEntityDiv.style.transition = "opacity 0.3s ease-out"; // Set the transition property first
            requestAnimationFrame(() => {
              // Wait for the next frame to apply opacity change
              newEntityDiv.style.opacity = "1"; // Now change opacity to trigger the fade-in
            });

            // Clean up transitions after animation (optional but good practice)
            setTimeout(() => {
              existingNotes.forEach((note) => {
                note.style.transition = "";
              });
              newEntityDiv.style.transition = ""; // Also clean up the new div's transition
            }, 350);

            // Activate characters state after animation starts
            activateCharacters(startChapter, startParagraph, getCurrentBookSlug(), endChapter, endParagraph, true);
            // Unset flag after FLIP animation completes
            setTimeout(() => {
              isUpdatingNotes = false;
            }, 350);
          });
        });
        return; // Exit after handling optimized case
      }
      // If addedCharacterData is null, fall through to fallback, but first unset the flag
      isUpdatingNotes = false;
    }

    // --- Optimized Case: Single Character Removed (First or Last) ---
    else if (addedNames.length === 0 && removedNames.length === 1 && container) {
      const removedName = removedNames[0];
      const existingNotes = Array.from(container.querySelectorAll<HTMLElement>(".entity-note"));
      const noteToRemove = existingNotes.find((note) => note.dataset.canonicalName === removedName);
      const isFirst = noteToRemove === existingNotes[0];
      const isLast = noteToRemove === existingNotes[existingNotes.length - 1];

      if (noteToRemove && (isFirst || isLast)) {
        console.log(`Optimized Update: Fading out ${isFirst ? "first" : "last"} character - ${removedName}`);
        isUpdatingNotes = true; // Set flag for this specific animation

        noteToRemove.classList.add("fade-out");
        setTimeout(() => {
          if (document.body.contains(noteToRemove)) {
            console.log(`Removing faded-out note via setTimeout: ${removedName}`);
            noteToRemove.remove();
          }
          isUpdatingNotes = false; // Unset flag after timeout
        }, 350); // Match transition duration + buffer

        previousCharacters = newCharacterNames; // Update cache to reflect target state
        activateCharacters(startChapter, startParagraph, getCurrentBookSlug(), endChapter, endParagraph, true);
        return; // Exit after handling optimized case
      }
      // If not first/last, fall through to fallback
      isUpdatingNotes = false; // Reset flag if this specific optimisation didn't run
    }

    // --- Fallback Case: Multiple changes or no existing container ---
    console.log("Fallback Update: Replacing entire notes container.");
    const oldEntityContainer = leftNotes.querySelector<HTMLElement>(".entity-notes-container");

    // Function to create and animate the new container (modified slightly)
    const createAndAnimateNewContainer = () => {
      const newEntityContainer = document.createElement("div");
      newEntityContainer.className = "entity-notes-container";
      currentCharactersData.forEach((entity) => {
        const entityDiv = createEditableEntity(entity);
        newEntityContainer.appendChild(entityDiv);
      });
      leftNotes.appendChild(newEntityContainer);
      const entityNotes = newEntityContainer.querySelectorAll(".entity-note");
      entityNotes.forEach((note, index) => {
        if (note instanceof HTMLElement) {
          note.style.setProperty("--stagger-delay", `${index * 0.07}s`);
          note.classList.add("sidebar-item-animate");
        }
      });
      setTimeout(() => {
        newEntityContainer.classList.add("fade-in");
        activateCharacters(startChapter, startParagraph, getCurrentBookSlug(), endChapter, endParagraph, true);
        // Unset the flag after the fade-in duration
        setTimeout(() => {
          isUpdatingNotes = false;
        }, 300); // Match fade-in duration
      }, 10);
      previousCharacters = newCharacterNames;
    };

    // **Immediate Removal** in fallback
    if (oldEntityContainer) {
      console.log("Immediately removing old container in fallback.");
      oldEntityContainer.remove(); // Remove instantly, cancelling any transition/listener
    }

    // Always create the new container after potentially removing the old one
    createAndAnimateNewContainer();
  }
}

// Create or update the mobile character strip
function createMobileCharacterStrip(characters: ParsedParagraphRange[]) {
  // Remove any existing strip first
  const existingStrip = document.getElementById("mobile-character-strip");
  if (existingStrip) {
    existingStrip.remove();
  }

  // Remove any existing horizontal strip
  const existingHorizontalStrip = document.getElementById("mobile-horizontal-character-strip");
  if (existingHorizontalStrip) {
    existingHorizontalStrip.remove();
  }

  // Create new strip
  const mobileStrip = document.createElement("div");
  mobileStrip.className = "mobile-character-strip";
  mobileStrip.id = "mobile-character-strip";

  // If we're starting with hidden state, add the class
  if (!isMobileCharactersVisible()) {
    mobileStrip.classList.add("hidden");
  }

  // Create horizontal strip
  const horizontalStrip = document.createElement("div");
  horizontalStrip.className = "mobile-horizontal-character-strip";
  horizontalStrip.id = "mobile-horizontal-character-strip";

  // Add hidden class to horizontal strip if vertical strip is visible
  if (isMobileCharactersVisible()) {
    horizontalStrip.classList.add("hidden");
  }

  // Position the toggle button based on initial state

  // Create notes icon
  const notesIcon = document.createElement("div");
  notesIcon.style.width = "55px";
  notesIcon.style.height = "55px";
  notesIcon.style.borderRadius = "50%";
  notesIcon.style.backgroundColor = "#4a90e2";
  notesIcon.style.display = "flex";
  notesIcon.style.alignItems = "center";
  notesIcon.style.justifyContent = "center";
  notesIcon.style.margin = "0 auto 5px auto";
  notesIcon.style.border = "2px solid #ddd";
  notesIcon.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        `;

  const notesName = document.createElement("div");
  notesName.className = "character-name";
  notesName.textContent = "Notes";

  // Add click event to toggle notes
  notesIcon.addEventListener("click", toggleMobileNotes);

  // Add characters to strips
  characters.forEach((entity) => {
    // Get resolved character info (if any)
    // Use resolved image if available, otherwise use the original
    const imageUrl = entity.imageUrl;

    if (imageUrl) {
      // Create item for vertical strip
      const characterItem = document.createElement("div");
      characterItem.className = "mobile-character-item";

      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = entity.canonicalName;
      img.dataset.characterName = entity.canonicalName;
      img.dataset.summary = entity.summary || "";

      const name = document.createElement("div");
      name.className = "character-name";
      name.textContent = entity.canonicalName;

      characterItem.appendChild(img);
      characterItem.appendChild(name);

      // Add click event to show character details modal first
      img.addEventListener("click", () => {
        showCharacterDetailsModal(entity.canonicalName, imageUrl, entity.summary || "");
      });

      mobileStrip.appendChild(characterItem);

      // Create item for horizontal strip (clone the same elements)
      const horizontalCharacterItem = document.createElement("div");
      horizontalCharacterItem.className = "mobile-horizontal-character-item";

      const horizontalImg = document.createElement("img");
      horizontalImg.src = imageUrl;
      horizontalImg.alt = entity.canonicalName;
      horizontalImg.dataset.characterName = entity.canonicalName;
      horizontalImg.dataset.summary = entity.summary || "";

      const horizontalName = document.createElement("div");
      horizontalName.className = "character-name";
      horizontalName.textContent = entity.canonicalName;

      horizontalCharacterItem.appendChild(horizontalImg);
      horizontalCharacterItem.appendChild(horizontalName);

      // Add click event to show character details modal
      horizontalImg.addEventListener("click", () => {
        showCharacterDetailsModal(entity.canonicalName, imageUrl, entity.summary || "");
      });

      horizontalStrip.appendChild(horizontalCharacterItem);
    }
  });

  console.log("adding strips to body");
  // Add strips to body
  document.getElementById("legacy")!.appendChild(mobileStrip);
  document.getElementById("legacy")!.appendChild(horizontalStrip);
}

// Initialize the viewer and fetch initial metadata
async function initPage() {
  // Check for saved position
  const savedPosition = getSavedLocation();

  // Initialize the viewer
  initializePages();

  // Pre-warm the cache for the next several pages in the background
  preWarmCache();

  // Scroll to the saved position
  setTimeout(() => {
    goToParagraph(savedPosition.chapter, savedPosition.paragraph);
  }, 100);

  // Set up resize handler for responsive layout
  window.addEventListener("resize", handleResize);

  // Initial layout based on screen size
  handleResize();
}

// Handle window resize events
function handleResize() {
  // Close mobile notes panel when transitioning to desktop
  if (!isMobile() && isMobileNotesVisible) {
    isMobileNotesVisible = false;
    const leftNotes = document.getElementById("left-notes");
    if (leftNotes) {
      leftNotes.classList.remove("active");
    }
  }
}

// Function to pre-warm the cache for upcoming pages
async function preWarmCache() {
  // Calculate range to preload (current page plus several before and after)
}

async function fetchExistingCharactersWithImages() {
  try {
    const response = await fetch(`/api/characters/images/${getCurrentBookSlug()}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch characters with images: ${response.statusText}`);
    }
    return (await response.json()) as { [name: string]: string };
  } catch (error) {
    console.error("Error fetching characters with images:", error);
    return {};
  }
}

async function removeCharacter(characterName) {
  try {
    const response = await fetch(`/api/characters/remove/${getCurrentBookSlug()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to remove character: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error removing character:", error);
    return null;
  }
}

async function mapCharacter(characterName, existingCharacterName, existingCharacterImageUrl) {
  try {
    const response = await fetch(`/api/characters/map/${getCurrentBookSlug()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterName, existingCharacterName, existingCharacterImageUrl }),
    });

    if (!response.ok) {
      throw new Error(`Failed to map character: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error mapping character:", error);
    return null;
  }
}

async function createCharacterImage(characterName: string) {
  try {
    const response = await fetch(`/api/characters/createImage/${getCurrentBookSlug()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create character image: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error creating character image:", error);
    return null;
  }
}

// Modal functions
function showCharacterDetailsModal(characterName: string, imageUrl: string, summary?: string) {
  // Update modal content
  if (!modalDetailsCharacterName || !modalDetailsCharacterImage || !modalDetailsCharacterSummary) {
    console.error("Error creating modalDetailsCharacterImage");
    return;
  }
  modalDetailsCharacterName.textContent = characterName;
  modalDetailsCharacterImage["src"] = imageUrl;
  modalDetailsCharacterImage["alt"] = characterName;
  modalDetailsCharacterSummary.textContent = summary || "No additional information available.";

  // Add click event to show edit modal on image click
  modalDetailsCharacterImage.onclick = () => {
    hideCharacterDetailsModal();
    showCharacterModal(characterName, imageUrl);
  };

  // Show modal
  characterDetailsModal.classList.add("active");
}

function hideCharacterDetailsModal() {
  characterDetailsModal.classList.remove("active");
}

function showCharacterModal(characterName: string, imageUrl: string) {
  // Set current character data
  currentCharacter = { name: characterName, imageUrl: imageUrl };

  // Update modal content
  modalCharacterName.textContent = characterName;
  modalCharacterImage["src"] = imageUrl;
  modalCharacterImage["alt"] = characterName;

  // Show modal
  characterModal.classList.add("active");
}

function hideCharacterModal() {
  characterModal.classList.remove("active");
  // Reset current character
  currentCharacter = null;
}

async function showMappingModal(characterName: string) {
  // Set source character
  sourceCharacterName.textContent = characterName;

  // Clear previous selection
  selectedCharacterForMapping = null;

  // Fetch existing characters with images
  const charactersWithImages = await fetchExistingCharactersWithImages();

  // Clear character grid
  characterGrid.innerHTML = "";

  // Add character cards to grid
  Object.entries(charactersWithImages).forEach(([name, imageUrl]) => {
    // Skip if it's the same character
    if (name === characterName) return;

    const card = document.createElement("div");
    card.className = "character-card";
    card.dataset.characterName = name;
    card.dataset.imageUrl = imageUrl;

    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = name;

    const nameDiv = document.createElement("div");
    nameDiv.className = "character-name";
    nameDiv.textContent = name;

    card.appendChild(img);
    card.appendChild(nameDiv);

    // Add click event to select character
    card.addEventListener("click", () => {
      // Remove selected class from all cards
      document.querySelectorAll(".character-card").forEach((c) => {
        c.classList.remove("selected");
      });

      // Add selected class to this card
      card.classList.add("selected");

      // Store selected character info
      selectedCharacterForMapping = { name: name, imageUrl: imageUrl };
    });

    characterGrid.appendChild(card);
  });

  // Hide character modal and show mapping modal
  hideCharacterModal();
  mappingModal.classList.add("active");
  confirmMappingButton.addEventListener("click", async () => {
    if (!characterName || !selectedCharacterForMapping) {
      console.log("currentCharacter", characterName);
      console.log("selectedCharacterForMapping", selectedCharacterForMapping);
      alert("Please select a character to map to");
      return;
    }

    try {
      const result = await mapCharacter(characterName, selectedCharacterForMapping.name, selectedCharacterForMapping.imageUrl);

      if (result) {
        alert(`${characterName} mapped to ${selectedCharacterForMapping.name} successfully`);
        // Clear from cache and update view
        clearCharacterFromCache(characterName);
      }
    } catch (error) {
      alert(`Error mapping character: ${error.message}`);
    }

    hideMappingModal();
  });
}

function hideMappingModal() {
  mappingModal.classList.remove("active");
  // Reset selected character
  selectedCharacterForMapping = null;
}

// Clear cache for a specific character
function clearCharacterFromCache(characterName) {
  // Iterate through all cached pages and clear this character's data
  Object.keys(pageMetadataCache).forEach((pageKey) => {
    const page = pageMetadataCache[pageKey];
    if (page && page.metadata && page.metadata.notesForPage) {
      // Mark the cache as needing refresh for this character
      page.needsRefresh = true;
    }
  });

  // Also clear from image cache
  Object.keys(imageCache).forEach((key) => {
    if (key.includes(characterName)) {
      delete imageCache[key];
    }
  });
}

// Event listeners for modals
characterModalClose.addEventListener("click", hideCharacterModal);
characterDetailsModalClose.addEventListener("click", hideCharacterDetailsModal);
mappingModalClose.addEventListener("click", hideMappingModal);

// Event listeners for character actions
removeCharacterButton.addEventListener("click", async () => {
  if (!currentCharacter) return;

  try {
    const result = await removeCharacter(currentCharacter.name);
    if (result) {
      alert(`Character ${currentCharacter.name} removed successfully`);
      // Clear from cache and update view
      clearCharacterFromCache(currentCharacter.name);
    }
  } catch (error) {
    alert(`Error removing character: ${error.message}`);
  }

  hideCharacterModal();
});

mapCharacterButton.addEventListener("click", () => {
  if (!currentCharacter) return;
  showMappingModal(currentCharacter.name);
});

createImageButton.addEventListener("click", async () => {
  if (!currentCharacter) return;

  try {
    const result = await createCharacterImage(currentCharacter.name);
    if (result) {
      alert(`Image for ${currentCharacter.name} created successfully`);
      // Clear from cache and update view
      clearCharacterFromCache(currentCharacter.name);
    }
  } catch (error) {
    alert(`Error creating image: ${error.message}`);
  }

  hideCharacterModal();
});

cancelMappingButton.addEventListener("click", hideMappingModal);

// Toggle night mode
export function toggleNightMode() {
  setIsNightMode(!isNightMode());
}

// Add swipe gesture support for mobile
document.addEventListener(
  "touchstart",
  (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchCurrentX = touchStartX;
    swipeStarted = true;
    isSwiping = false;

    // Check if touch is starting from right edge for notes panel
    const rightEdgeThreshold = window.innerWidth - 30; // 30px from right edge
    if (touchStartX > rightEdgeThreshold && isMobile()) {
      // Add visual feedback to the edge indicator
      const indicator = document.getElementById("notes-edge-indicator");
      if (indicator) {
        indicator.classList.add("swiping");
      }
    }

    // Log touch start position for debugging
    console.log(`Touch start at X: ${touchStartX}, sidebar visible: ${isMobileCharactersVisible()}`);
  },
  { passive: true },
);

document.addEventListener(
  "touchmove",
  (e) => {
    if (!swipeStarted || !isMobile()) return;

    touchCurrentX = e.changedTouches[0].screenX;
    const diff = touchCurrentX - touchStartX;

    // PRIORITY: Handle swipes when notes panel is visible
    if (isMobileNotesVisible) {
      // Only process left-to-right swipes to close notes panel
      if (diff > 0) {
        e.preventDefault(); // Prevent default scrolling
        const leftNotes = document.getElementById("left-notes");

        // Calculate how far to slide based on swipe distance (max 100%)
        const slidePercent = Math.min(100, (diff / window.innerWidth) * 200); // 200% factor makes it more responsive

        // Apply transform to notes panel
        if (leftNotes) {
          leftNotes.style.transform = `translateX(${slidePercent}%)`;
        }

        // Adjust overlay opacity
        const notesOverlay = document.getElementById("notes-overlay");
        if (notesOverlay) {
          const newOpacity = Math.max(0, 1 - (slidePercent / 100) * 1.5);
          notesOverlay.style.opacity = newOpacity.toString();
        }
      }
      return; // Skip the rest of the handler when notes are visible
    }

    // If notes are not visible, handle other swipe cases...

    // Check if this is a right-edge swipe for notes
    const rightEdgeThreshold = window.innerWidth - 30; // 30px from right edge
    const isRightEdgeSwipe = touchStartX > rightEdgeThreshold;

    if (isRightEdgeSwipe && !isMobileNotesVisible && diff < 0) {
      // This is a right-to-left swipe from the right edge
      // We could add a preview effect here if desired
      e.preventDefault(); // Prevent default scrolling
      return;
    }

    // For hiding the strip, allow swipes that start on the strip or within a larger area near it
    // For showing, allow swipes from a more generous left area
    const isStripAreaSwipe = isMobileCharactersVisible() && touchStartX < 120; // Increased from 90px
    const isLeftEdgeSwipe = !isMobileCharactersVisible() && touchStartX < 60; // Increased from 30px

    // Process the swipe if it's from the appropriate area or if already swiping
    if (isStripAreaSwipe || isLeftEdgeSwipe || isSwiping) {
      isSwiping = true;
      const charStrip = document.getElementById("mobile-character-strip");
      const contentContainer = document.getElementById("content-container");

      if (charStrip && contentContainer) {
        e.preventDefault(); // Prevent scrolling when swiping the strip

        // Add visual preview of the character strip movement during swipe
        // If the strip is visible, move it left (negative); if hidden, move it from the left (positive)
        if (isMobileCharactersVisible()) {
          // Calculate how far to slide based on swipe distance (0 to -100%)
          const slidePercent = Math.max(-100, Math.min(0, (diff / window.innerWidth) * 300)); // 300% factor makes it more responsive
          charStrip.style.transform = `translateX(${slidePercent}%)`;
        } else {
          // For hidden strip, start from -100% and move toward 0
          const slidePercent = Math.max(-100, Math.min(0, (diff / window.innerWidth) * 300 - 100));
          charStrip.style.transform = `translateX(${slidePercent}%)`;
        }
      }
    }
  },
  { passive: false },
);

document.addEventListener(
  "touchend",
  (e) => {
    if (!swipeStarted || !isMobile()) return;

    touchEndX = e.changedTouches[0].screenX;
    const diff = touchEndX - touchStartX;

    // Remove swiping class from edge indicator
    const indicator = document.getElementById("notes-edge-indicator");
    if (indicator) {
      indicator.classList.remove("swiping");
    }

    // PRIORITY: Handle swipe completion when notes panel is visible
    if (isMobileNotesVisible) {
      const leftNotes = document.getElementById("left-notes");
      const notesOverlay = document.getElementById("notes-overlay");

      // Reset notes panel inline styles
      if (leftNotes) {
        leftNotes.style.transform = "";
      }
      if (notesOverlay) {
        notesOverlay.style.opacity = "";
      }

      // If significant right swipe, close the notes panel
      if (diff > window.innerWidth * 0.2) {
        // 20% of screen width threshold
        toggleMobileNotes();
      }

      swipeStarted = false;
      isSwiping = false;
      return; // Skip the rest of the handler
    }

    // Check if this was a right-edge swipe for notes
    const rightEdgeThreshold = window.innerWidth - 30; // 30px from right edge
    const isRightEdgeSwipe = touchStartX > rightEdgeThreshold;

    if (isRightEdgeSwipe && !isMobileNotesVisible && diff < -20) {
      // Right-to-left swipe from right edge - open notes panel
      toggleMobileNotes();
      swipeStarted = false;
      isSwiping = false;
      return; // Skip the rest of the handler
    }

    // Log touch end for debugging
    console.log(`Touch end - diff: ${diff}`);

    // Reset swipe state
    swipeStarted = false;

    if (isSwiping) {
      isSwiping = false;

      const charStrip = document.getElementById("mobile-character-strip");

      // Clean up the scroll position marker if it exists

      // Reset the transform style to ensure smooth transition
      if (charStrip) {
        charStrip.style.transform = "";
      }

      // Only toggle if the swipe distance is significant (at least 50px or 15% of screen width)
      const minSwipeDistance = Math.min(40, window.innerWidth * 0.1);
      if (Math.abs(diff) > minSwipeDistance) {
        toggleMobileCharacters();
      }
      return; // Don't proceed to the old handleSwipe function
    }

    handleSwipe();
  },
  { passive: true },
);

function handleSwipe() {
  const swipeThreshold = 40; // Minimum distance (in px) to trigger swipe - reduced for better responsiveness

  // Check if we have significant horizontal movement

  // Priority: Handle notes panel swipes
  if (isMobileNotesVisible) {
    // Left to right swipe (close notes if visible)
    if (touchEndX > touchStartX + swipeThreshold) {
      toggleMobileNotes();
    }
    return; // Skip other checks when notes are visible
  }

  // Handle character strip swipes when notes not visible

  // Right to left swipe (open notes if not visible)
  // We only want to open notes when swiping from the right edge of the screen
  const rightEdgeThreshold = window.innerWidth - 30; // 30px from right edge
  if (touchEndX < touchStartX - swipeThreshold && touchStartX > rightEdgeThreshold && !isMobileNotesVisible) {
    toggleMobileNotes();
  }
}

let scrollDebounce: string | number | NodeJS.Timeout;
let isScrolling = false;
// Start the initialization process
initPage()
  .catch((error) => {
    console.error("Error initializing page:", error);
    loadingIndicator.innerHTML = "<div>Error loading book. Please refresh the page.</div>";
  })
  .then(() => {
    console.log("container exists?", document.getElementById("content-container"));
    // Add scroll event listener to update notes based on visible pages
    document.getElementById("content-container")?.addEventListener("scroll", () => {
      if (scrollDebounce) clearTimeout(scrollDebounce);
      isScrolling = true;
      scrollDebounce = setTimeout(() => {
        isScrolling = false;
      }, 400);
    });
  });
// Add the characters-hidden class to body initially if the character strip is hidden
document.getElementById("legacy")!.classList.toggle("characters-hidden", !isMobileCharactersVisible());

// Add touch event handling for the notes edge indicator
const notesEdgeIndicator = document.getElementById("notes-edge-indicator");
if (notesEdgeIndicator) {
  // Add touch event listener
  notesEdgeIndicator.addEventListener(
    "touchstart",
    (e) => {
      if (isMobile() && !isMobileNotesVisible) {
        e.preventDefault(); // Prevent default to avoid any scrolling
        e.stopPropagation(); // Stop propagation to prevent other handlers
        toggleMobileNotes();
      }
    },
    { passive: false },
  ); // Use non-passive listener to call preventDefault

  // Add regular click event listener
  notesEdgeIndicator.addEventListener("click", (e) => {
    console.log("clicked notesEdgeIndicator", isMobile(), !isMobileNotesVisible);
    if (isMobile() && !isMobileNotesVisible) {
      e.preventDefault(); // Prevent default just in case
      e.stopPropagation(); // Stop propagation to prevent other handlers
      toggleMobileNotes();
    }
  });
}

// Menu event listeners

// Add event listeners for closing modals
document.querySelectorAll(".modal-close").forEach((button) => {
  const modal = button.closest(".modal-overlay");
  button.addEventListener("click", () => {
    modal.classList.remove("active");
  });
});

async function keyboardNavigationSetup(event: KeyboardEvent) {
  // If search modal is active, let it handle its own keyboard events
  if (isSearchActive()) {
    if (event.key === "Escape") {
      hideSearchModal();
    }
    return;
  }
  if (isEditActive()) {
    return;
  }
  // if (event.key === "s" && (event.metaKey || event.ctrlKey)) {
  //   event.preventDefault(); // Prevent browser save dialog
  //   enterSetPageNumberMode();
  //   return;
  // }

  // // Check if the key is a number (0-9)
  // if (/^[0-9]$/.test(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) {
  //   handlePageNumberInput(event.key);
  //   return;
  // }

  // Handle other keyboard navigation
  switch (event.key) {
    case "ArrowLeft":
    case "p":
    case "P":
      console.log("go to previous page");
      await goToPreviousPage();
      break;
    case "ArrowRight":
    case "n":
    case "N":
      console.log("go to next page");
      await goToNextPage();
      break;
    case "m":
    case "M":
      toggleNightMode();
      break;
    case "c":
    case "C":
      toggleMobileCharacters();
      break;
    case "Escape":
      // Cancel page number input on Escape
      typedPageNumber = "";
      pageOffsetInput = "";
      isSettingPageNumber = false;
      if (pageInputTimeout) {
        clearTimeout(pageInputTimeout);
      }
      if (pageOffsetInputTimeout) {
        clearTimeout(pageOffsetInputTimeout);
      }
      pageNumberIndicator.classList.remove("visible");

      // Close notes panel if open
      if (isMobileNotesVisible) {
        toggleMobileNotes();
      }

      // Close any active modals
      document.querySelectorAll(".modal-overlay.active").forEach((modal) => {
        modal.classList.remove("active");
      });
      break;
    // Add "f" key to toggle search modal (without modifiers)
    case "f":
    case "F":
      // Only trigger if no modifiers (the Cmd+F/Ctrl+F is handled elsewhere)
      console.log("f key pressed", event.metaKey, event.ctrlKey, event.altKey);
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        showSearchModal();
      }
      break;
  }
}

function isAppearanceWithinRange(
  appearance: { chapterNumber: number; paragraphNumber: number },
  startChapter: number,
  startParagraph: number,
  endChapter?: number,
  endParagraph?: number,
): boolean {
  const { chapterNumber, paragraphNumber } = appearance;

  // If no end chapter/paragraph is defined, treat it as a single paragraph check
  const effectiveEndChapter = endChapter === undefined ? startChapter : endChapter;
  const effectiveEndParagraph = endParagraph === undefined ? startParagraph : endParagraph;

  // Single chapter range
  if (startChapter === effectiveEndChapter) {
    // 10 49 10 1 true
    return chapterNumber === startChapter && paragraphNumber >= startParagraph && paragraphNumber <= effectiveEndParagraph;
  }

  // Multi-chapter range cases:
  // Case 1: Paragraphs in the start chapter, at or after startParagraph
  if (chapterNumber === startChapter && paragraphNumber >= startParagraph) {
    return true;
  }
  // Case 2: Paragraphs in chapters strictly between start and end chapters
  if (chapterNumber > startChapter && chapterNumber < effectiveEndChapter) {
    return true;
  }
  // Case 3: Paragraphs in the end chapter, at or before endParagraph
  if (chapterNumber === effectiveEndChapter && paragraphNumber <= effectiveEndParagraph) {
    return true;
  }

  return false; // Not in range
}

function activateCharacters(chapterNum: number, paragraphNum: number, bookSlug: string, endParagraph?: number, endChapter?: number, onlyTalking = false) {
  const entityNotes = document.querySelectorAll<HTMLElement>("#left-notes .entity-note");
  entityNotes.forEach((note) => {
    const appearancesStr = note.dataset.appearances;
    const canonicalName = note.dataset.canonicalName;
    if (!appearancesStr || !canonicalName) return;

    try {
      const appearances: { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean }[] = JSON.parse(appearancesStr);
      let isInRange = false;
      let isTalkingInRange = false;

      // Check if any appearance falls within the specified range
      for (const app of appearances) {
        if (isAppearanceWithinRange(app, chapterNum, paragraphNum, endChapter, endParagraph)) {
          isInRange = true;
          if (app.isTalkingInParagraph) {
            isTalkingInRange = true;
            break; // Found talking in range, no need to check further appearances for this entity
          } else {
          }
        } else {
        }
      }

      note.classList.remove("highlighted-entity", "highlighted-talking-entity");
      const imageElement = note.querySelector<HTMLImageElement>(".entity-image");

      if (isTalkingInRange) {
        note.classList.add("highlighted-talking-entity");
        // Swap image to GIF if talking
        if (imageElement && imageElement.dataset.originalSrc) {
          const gifSrc = getMovingPictureFilePathForName(canonicalName, bookSlug as BOOK_SLUGS);
          const currentSrcFilename = imageElement.src.split("/").pop();
          const gifSrcFilename = gifSrc.split("/").pop();
          if (currentSrcFilename !== gifSrcFilename) {
            imageElement.src = gifSrc;
          }
        }
      } else if (isInRange && !onlyTalking) {
        note.classList.add("highlighted-entity");
        // Ensure image is PNG if just mentioned (and was previously GIF)
        if (imageElement && imageElement.dataset.originalSrc) {
          const currentSrcFilename = imageElement.src.split("/").pop();
          const originalSrcFilename = imageElement.dataset.originalSrc.split("/").pop();
          if (currentSrcFilename !== originalSrcFilename) {
            imageElement.src = imageElement.dataset.originalSrc;
          }
        }
      } else {
        // If not in range, or only showing talking entities and this one isn't talking in range
        // console.log(`GOZDECKI NOT IN RANGE OR NOT TALKING IN RANGE FOR ${canonicalName}`);
        // Ensure image is PNG if it was changed
        if (imageElement && imageElement.dataset.originalSrc) {
          const currentSrcFilename = imageElement.src.split("/").pop();
          const originalSrcFilename = imageElement.dataset.originalSrc.split("/").pop();
          if (currentSrcFilename !== originalSrcFilename) {
            imageElement.src = imageElement.dataset.originalSrc;
          }
        }
      }
    } catch (e) {
      console.error("Error processing appearances for entity highlight:", e);
    }
  });
}

function setupParagraphHighlighting() {
  const contentContainer = document.getElementById("content-container");
  if (!contentContainer) return;
  const bookSlug = getCurrentBookSlug(); // Get book slug once

  contentContainer.addEventListener("mouseover", (event) => {
    if (isScrolling) return;
    const target = event.target as HTMLElement;
    const paragraph = target.closest<HTMLElement>("section[data-chapter] [data-index]");
    if (paragraph) {
      const section = paragraph.closest<HTMLElement>("section[data-chapter]");
      if (!section) return;

      const chapterNumber = section.dataset.chapter;
      const paragraphNumber = paragraph.dataset.index;

      if (chapterNumber && paragraphNumber) {
        const chapterNum = parseInt(chapterNumber);
        const paragraphNum = parseInt(paragraphNumber);
        activateCharacters(chapterNum, paragraphNum, bookSlug);
      }
    }
  });

  contentContainer.addEventListener("mouseout", (event) => {
    if (isScrolling) return;
    const target = event.target as HTMLElement;
    const paragraph = target.closest<HTMLElement>("section[data-chapter] p[data-index]");

    if (paragraph) {
      const entityNotes = document.querySelectorAll<HTMLElement>("#left-notes .entity-note");
      entityNotes.forEach((note) => {
        note.classList.remove("highlighted-entity", "highlighted-talking-entity");

        // Revert image to original PNG
        const imageElement = note.querySelector<HTMLImageElement>(".entity-image");
        if (imageElement && imageElement.dataset.originalSrc) {
          // Extract just the filenames for comparison
          const currentSrcFilename = imageElement.src.split("/").pop();
          const originalSrcFilename = imageElement.dataset.originalSrc.split("/").pop();

          if (currentSrcFilename !== originalSrcFilename) {
            imageElement.src = imageElement.dataset.originalSrc;
          }
        }
      });
    }
  });
}

function onDOMLoaded() {
  initializeNoteLinkBlinking();

  if (localStorage.getItem("nightMode") === "true") {
    setIsNightMode(true);
  }

  // Initialize search modal
  initSearchModal();

  // Add event listeners for closing modals
  document.querySelectorAll(".modal-close").forEach((button) => {
    const modal = button.closest(".modal-overlay");
    button.addEventListener("click", () => {
      modal.classList.remove("active");
    });
  });

  // Menu options event listeners

  // Keyboard navigation
  document.addEventListener("keydown", async (event) => {
    // Intercept browser search (Cmd+F or Ctrl+F)
    if ((event.key === "f" || event.key === "F") && (event.metaKey || event.ctrlKey)) {
      event.preventDefault(); // Prevent default browser search
      showSearchModal();
      return;
    }

    // Handle Command+S to set page number
    await keyboardNavigationSetup(event);
  });

  // Setup highlighting paragraphs on entity hover and vice-versa
  setupParagraphHighlighting();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onDOMLoaded);
} else {
  onDOMLoaded();
}

startReactComponents();

// Make showCharacterDetailsModal available globally for the sidebar editor
window.showCharacterDetailsModal = showCharacterDetailsModal;

function initializeNoteLinkBlinking() {
  // Set up hover behavior for note links
  const contentContainer = document.getElementById("content-container");
  if (!contentContainer) return;

  // Add event delegation for all link-note elements
  contentContainer.addEventListener("mouseover", (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains("link-note") || target.closest(".link-note")) {
      const linkNote = target.classList.contains("link-note") ? target : (target.closest(".link-note") as HTMLElement);
      const targetId = linkNote.getAttribute("href")?.substring(1); // Get href like '#fn3' and remove '#'

      if (targetId) {
        const noteElement = document.getElementById(targetId);
        if (noteElement && noteElement.closest("#right-notes-scrollable-container")) {
          // Scroll the note into view smoothly
          noteElement.scrollIntoView({ behavior: "smooth", block: "center" });

          // Add highlight-blink class to run animation
          noteElement.classList.add("highlight-blink");

          // Remove the class after animation completes
          setTimeout(() => {
            noteElement.classList.remove("highlight-blink");
          }, 2000); // Adjust timing based on your animation duration
        }
      }
    }
  });

  // Add mouseout handler to ensure highlight is removed when no longer hovering
  contentContainer.addEventListener("mouseout", (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains("link-note") || target.closest(".link-note")) {
      const linkNote = target.classList.contains("link-note") ? target : (target.closest(".link-note") as HTMLElement);
      const targetId = linkNote.getAttribute("href")?.substring(1);

      if (targetId) {
        const noteElement = document.getElementById(targetId);
        if (noteElement) {
          // Remove highlight when mouse leaves the link
          setTimeout(() => {
            noteElement.classList.remove("highlight-blink");
          }, 500); // Short delay to allow user to move mouse to the note
        }
      }
    }
  });
}
