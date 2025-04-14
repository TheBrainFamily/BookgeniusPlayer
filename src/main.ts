import { pagesContent } from "./book";

import { getPageOffset, setPageOffset } from "./pageOffset";
import { isNightMode, setIsNightMode } from "@/src/helpers/setIsNightMode";
import { getCurrentPage, goToNextPage, goToPage, goToPreviousPage, setCurrentPage } from "@/src/helpers/pagesNavigation";
import { pagesToSkipFooterGeneration, romanNumeralPages } from "@/src/consts";
import { isMobileCharactersVisible, getIsTogglingMobileCharacters, toggleMobileCharacters } from "@/src/isMobileCharactersVisible";
import { startReactComponents } from "./react-components";
import { getCurrentBookSlug } from "./getCurrentBookSlug";
import { pageChapters } from "./chapters";
import { initSearchModal, showSearchModal, hideSearchModal, isSearchActive } from "./searchModal";

// Import the sidebar editor utilities
import { createEditableEntity, createEditablePageSummary, createEditableChapterSummary, createAddCharacterButton, addEditorStyles, isEditActive } from "./utils/sidebarEditor";
import { getParagraphRange } from "./fetchers/getParagraphRange";
import { getSavedLocation, goToParagraph, setCurrentLocation } from "./helpers/paragraphsNavigation";
import { setupNoteLinkBlinking } from "./annotationsHandling";

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

getParagraphRange({ bookSlug: getCurrentBookSlug(), startChapter: 1, startParagraph: 1, endChapter: 2, endParagraph: 10 }).then((paragraphs) => {
  console.log("GOZDECKI ELO", paragraphs);
});

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
    threshold: 0.8, // Consider page visible when 40% is in view
  };

  // --- State for tracking all currently intersecting pages ---
  const intersectingPages = new Set<Element>();
  let currentlyActivePageElement: Element | null = null;
  let currentlyLastActivePageElement: Element | null = null;
  // ----------------------------------------------------------
  const observer = new IntersectionObserver((entries) => {
    // 1. Update the set of intersecting pages based on the current changes
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        intersectingPages.add(entry.target);
      } else {
        intersectingPages.delete(entry.target);
      }
    });

    // 2. Determine the topmost and bottommost pages from the *entire set* of intersecting pages
    if (intersectingPages.size > 0) {
      // Convert Set to array and sort by viewport top position
      const sortedIntersectingPages = Array.from(intersectingPages).sort((a, b) => {
        return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
      });

      const topVisiblePageElement = sortedIntersectingPages[0];
      const bottomVisiblePageElement = sortedIntersectingPages[sortedIntersectingPages.length - 1]; // Get the last element

      // 3. Update active state only if the topmost or bottommost page has changed
      // (We might refine this condition later if needed, for now, update if any intersecting element changes)
      if (topVisiblePageElement !== currentlyActivePageElement || bottomVisiblePageElement !== currentlyLastActivePageElement) {
        // TODO: Revisit this condition? Maybe check bottom element too?
        console.log("[Observer] Top visible page:", topVisiblePageElement.id || topVisiblePageElement);
        console.log("[Observer] Bottom visible page:", bottomVisiblePageElement.id || bottomVisiblePageElement);

        currentlyActivePageElement = topVisiblePageElement; // Update the tracked active page (using top for now)
        currentlyLastActivePageElement = bottomVisiblePageElement;
        // --- Extract Chapter and Paragraph Info ---
        const getParagraphInfo = (element: Element): { chapter: number | null; paragraph: number | null } => {
          const paragraphStr = (element as HTMLElement).dataset.index;
          const chapterElement = element.closest("section[data-chapter]");
          const chapterStr = chapterElement ? (chapterElement as HTMLElement).dataset.chapter : null;

          return { chapter: chapterStr ? parseInt(chapterStr) : null, paragraph: paragraphStr ? parseInt(paragraphStr) : null };
        };

        const startInfo = getParagraphInfo(topVisiblePageElement);
        const endInfo = getParagraphInfo(bottomVisiblePageElement);
        // -----------------------------------------

        // 4. Call updateParagraphNotes if we have valid info
        if (startInfo.chapter !== null && startInfo.paragraph !== null && endInfo.chapter !== null && endInfo.paragraph !== null) {
          console.log(`[Observer] Updating notes for Ch ${startInfo.chapter}:${startInfo.paragraph} to Ch ${endInfo.chapter}:${endInfo.paragraph}`);
          updateParagraphNotes({ startChapter: startInfo.chapter, startParagraph: startInfo.paragraph, endChapter: endInfo.chapter, endParagraph: endInfo.paragraph });
          console.log("setting current locatio from intersection", { chapter: startInfo.chapter, paragraph: startInfo.paragraph });
          setCurrentLocation({ chapter: startInfo.chapter, paragraph: startInfo.paragraph });
        } else {
          console.warn("[Observer] Could not extract chapter/paragraph info for:", topVisiblePageElement, bottomVisiblePageElement);
        }
      }
    } else {
      // Handle case where no pages are intersecting (optional)
      if (currentlyActivePageElement !== null) {
        console.log("[Observer] No pages intersecting.");
        currentlyActivePageElement = null;
        // Potentially clear notes or update state here
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
  const allNotes = document.querySelectorAll<HTMLElement>("#right-notes section");
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
          // Ensure the note element exists and is a direct child section of #right-notes
          if (noteElement && noteElement.parentElement?.id === "right-notes") {
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
  dealWithAnnotations({ startChapter, startParagraph, endChapter, endParagraph });
  const leftNotes = document.getElementById("left-notes");
  if (!leftNotes) return;

  const paragraphs = await getParagraphRange({ bookSlug: getCurrentBookSlug(), startChapter: startChapter - 1, startParagraph, endChapter: endChapter - 1, endParagraph });
  addEditorStyles();

  if (isMobile()) {
    const notesTitle = `Notes for Ch ${startChapter}:${startParagraph} to Ch ${endChapter}:${endParagraph}`;
    const closeButton = `<button class="close-notes-button">&times;</button>`;
    leftNotes.innerHTML = `<h3>${notesTitle}</h3>${closeButton}`;
    const closeBtn = leftNotes.querySelector(".close-notes-button");
    if (closeBtn) {
      closeBtn.addEventListener("click", toggleMobileNotes);
    }
  } else {
    leftNotes.innerHTML = ``;
  }

  if (isMobile()) {
    createMobileCharacterStrip(paragraphs);
  }

  // Create a container for entity notes if not mobile
  if (!isMobile()) {
    const entityContainer = document.createElement("div");
    entityContainer.className = "entity-notes-container";
    leftNotes.appendChild(entityContainer);

    // prepare all notes in the notes panel
    paragraphs.forEach((entity) => {
      // Create editable entity div instead of static one
      const entityDiv = createEditableEntity(10, entity);
      entityContainer.appendChild(entityDiv);
    });
  } else {
    // On mobile, add directly to leftNotes
    paragraphs.forEach((entity) => {
      const entityDiv = createEditableEntity(10, entity);
      leftNotes.appendChild(entityDiv);
    });
  }
}

// Create or update the mobile character strip
function createMobileCharacterStrip(combinedNotes) {
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
  combinedNotes.forEach((entity) => {
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
  const preloadBefore = Math.max(0, getCurrentPage() - 2);
  const preloadAfter = Math.min(pagesContent.length - 1, getCurrentPage() + 4);

  // Calculate actual page numbers for API request
  const startPageNumber = preloadBefore - (romanNumeralPages - 1) + 1;
  const endPageNumber = preloadAfter - (romanNumeralPages - 1) + 1;

  // Fetch metadata in the background without awaiting
  // fetchPageRange(startPageNumber, endPageNumber).catch((error) => {
  //   console.error("Error pre-warming cache:", error);
  // });
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
        await updateView();
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
      await updateView();
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
      await updateView();
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
      scrollDebounce = setTimeout(() => {
        updateView();
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
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        showSearchModal();
      }
      break;
  }
}

// Initialize the app
document.addEventListener("DOMContentLoaded", function () {
  // Initialize night mode from localStorage
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
});

startReactComponents();

// Make showCharacterDetailsModal available globally for the sidebar editor
window.showCharacterDetailsModal = showCharacterDetailsModal;

setupNoteLinkBlinking();
