import "./styles.css";
import "./styles-narrow.css";
import "./globals.css";

import { isNightMode, setIsNightMode } from "@/src/helpers/setIsNightMode";
import { BOOK_SLUGS } from "@/src/consts";
import { isMobileCharactersVisible } from "@/src/isMobileCharactersVisible";
import { startReactComponents } from "./react-components";
import { getCurrentBookSlug } from "./getCurrentBookSlug";
import { hideSearchModal, initSearchModal, isSearchActive, showSearchModal } from "./searchModal";

// Import the sidebar editor utilities
import { createEditableEntity, isEditActive } from "./utils/sidebarEditor";
import { getParagraphRange, paragraphMetadataServicePure, ParsedParagraphRange, parseParagraphRange } from "./fetchers/getParagraphRange";
import { getSavedLocation, goToParagraph, setCurrentLocation } from "./helpers/paragraphsNavigation";
import { initializeNoteLinkBlinking } from "./annotationsHandling";
import { getMovingPictureFilePathForName } from "./utils/getFilePathsForName";
import { dealWithCutScenes } from "./deal-with-cut-scenes";

const splash = document.getElementById("splash")!;

splash.classList.add("hide");
// register ASAP, but don't hide splash until the SW tells us it's ready
if ("serviceWorker" in navigator) {
  try {
    navigator.serviceWorker.register("/sw.js", { type: "module" });
  } catch (e) {
    console.error("Service worker registration failed:", e);
  }
} else {
  splash.classList.add("hide");
  console.log("Service worker not supported");
}

navigator.serviceWorker?.addEventListener("message", (evt) => {
  if (evt.data?.type === "CACHE_COMPLETE") {
    splash.classList.add("hide"); // triggers your CSS transition
  }
});

const pageMetadataCache = {}; // Cache for page metadata
const imageCache = {}; // Cache to track which images have been preloaded
let isMobileNotesVisible = false; // Track if notes panel is open on mobile

// DOM elements
const loadingIndicator = document.getElementById("loading");

// Character modal elements
const characterModal = document.getElementById("character-modal")!;
const characterModalClose = characterModal.querySelector(".modal-close")!;
const modalCharacterImage = document.getElementById("modal-character-image")!;
const modalCharacterName = document.getElementById("modal-character-name")!;
const createImageButton = document.getElementById("create-image-button")!;

// Character details modal elements
const characterDetailsModal = document.getElementById("character-details-modal")!;
const characterDetailsModalClose = characterDetailsModal.querySelector(".modal-close")!;
const modalDetailsCharacterImage = document.getElementById("modal-details-character-image")!;
const modalDetailsCharacterName = document.getElementById("modal-details-character-name")!;
const modalDetailsCharacterSummary = document.getElementById("modal-details-character-summary")!;

// Character interaction state
let currentCharacter: { name: string; imageUrl: string } | null = null;

// Function to check if the device is mobile
function isMobile() {
  return false;
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

// Initialize pages
function initializePages() {
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
export const dealWithBackground = ({ startChapter, startParagraph, endChapter, endParagraph }) => {
  /* ---------- helpers ---------- */
  const toBackground = ({ chapter, file }) => {
    return { startChapter: chapter, startParagraph: 1, file, endChapter: chapter, endParagraph: 10000 };
  };

  const legacyElement = document.getElementById("legacy");
  const videoA = document.getElementById("bg-video-a");
  const videoB = document.getElementById("bg-video-b");

  /* Track which video is currently on top (A starts) */
  if (!legacyElement.dataset.front) {
    legacyElement.dataset.front = "a";
  }
  const getFront = () => (legacyElement.dataset.front === "a" ? videoA : videoB) as HTMLVideoElement;
  const getBack = () => (legacyElement.dataset.front === "a" ? videoB : videoA) as HTMLVideoElement;

  let front = getFront();
  let back = getBack();

  /* duration in ms = value of --transition-duration (default 0.8 s) */
  const fadeMs = parseFloat(getComputedStyle(front).transitionDuration) * 1000 || 800;

  /* -------- cross‑fade core -------- */
  function crossFadeTo(file) {
    if (legacyElement.dataset.currentFile === file) {
      return; /* already showing */
    }

    const newSrc = `/Pharaon/${file}`;

    back.src = newSrc;
    back.load(); /* start buffering */

    back.addEventListener(
      "loadeddata",
      () => {
        back.currentTime = 0;
        back.play();

        /* step 1 — be sure the back video starts at opacity 0 */
        back.classList.add("faded");

        /* step 2 — next frame: fade back in, front out */
        requestAnimationFrame(() => {
          back.classList.remove("faded"); /* fades IN */
          front.classList.add("faded"); /* fades OUT */
        });

        /* step 3 — after the transition, swap roles */
        setTimeout(() => {
          legacyElement.dataset.front = legacyElement.dataset.front === "a" ? "b" : "a";
          legacyElement.dataset.currentFile = file;

          /* refresh references for the next call */
          front = getFront();
          back = getBack();
        }, fadeMs);
      },
      { once: true },
    );
  }

  /* ---------- mapping  ---------- */
  const backgroundsPassedFromGemini = [
    { chapter: 1, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 2, file: "background-wawoz-fade.mp4" },
    { chapter: 3, file: "background-sara-slow-motion-loop.mp4" },
    { chapter: 4, file: "background-army-fade-loop.mp4" },
    { chapter: 5, file: "background-sara-estate-fade.mp4" },
    { chapter: 6, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 7, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 8, file: "background-moving-generic-estate-fade.mp4" },
    { chapter: 9, file: "background-moving-generic-estate-slow-motion-loop.mp4" },
    { chapter: 10, file: "background-moving-generic-faster-estate-fade.mp4" },
    { chapter: 11, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 12, file: "background-generic-pingpong-fade.mp4" },
    { chapter: 13, file: "background-moving-generic-estate-fade.mp4" },
    { chapter: 14, file: "background-moving-generic-estate-fade.mp4" },
    { chapter: 15, file: "background-moving-generic-estate-slow-motion-loop.mp4" },
    { chapter: 16, file: "background-generic-pingpong-fade.mp4" },
    { chapter: 17, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 18, file: "background-generic-pingpong-fade.mp4" },
    { chapter: 19, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 20, file: "background-egyptian-streets-palace-visible-loop.mp4" },
    { chapter: 21, file: "background-generic-pingpong-fade.mp4" },
    { chapter: 22, file: "background-generic-pingpong-fade.mp4" },
    { chapter: 23, file: "background-moving-generic-estate-fade.mp4" },
    { chapter: 24, file: "background-moving-generic-estate-fade.mp4" },
    { chapter: 25, file: "background-egyptian-streets-palace-visible-loop.mp4" },
  ];
  const backgrounds = backgroundsPassedFromGemini.map(toBackground);

  /* ---------- decide & apply ---------- */
  console.log("BACKGROUND deciding", { startChapter, startParagraph, endChapter, endParagraph });

  for (const bg of backgrounds) {
    if (startChapter === bg.startChapter && startParagraph <= bg.endParagraph && endChapter === bg.endChapter && endParagraph >= bg.startParagraph) {
      crossFadeTo(bg.file);
      break;
    }
  }

  /* when no match: fade to blurred PNG only */
  // if (!applied) {
  //   videoA.classList.add("faded");
  //   videoB.classList.add("faded");
  //   legacyElement.dataset.currentFile = "";
  // }
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
  dealWithCutScenes({ startChapter, startParagraph });
  const leftNotes = document.getElementById("left-notes");
  if (!leftNotes) return;
  const paragraphs =
    import.meta.env.VITE_DEVELOPMENT === "true"
      ? await paragraphMetadataServicePure.getCharactersMetadataForParagraphRange({
          bookSlug: getCurrentBookSlug(),
          startChapter: startChapter,
          startParagraph,
          endChapter: endChapter,
          endParagraph,
        })
      : await getParagraphRange({ bookSlug: getCurrentBookSlug(), startChapter: startChapter, startParagraph, endChapter: endChapter, endParagraph });
  const currentCharactersData = parseParagraphRange(paragraphs);

  const newCharacterNames = currentCharactersData.map((c) => c.canonicalName).sort(); // Sort for comparison
  const sortedPreviousCharacters = [...previousCharacters].sort(); // Sort previous too

  // Check if character list is identical (after sorting)
  if (newCharacterNames.length === sortedPreviousCharacters.length && newCharacterNames.every((c, index) => c === sortedPreviousCharacters[index])) {
    // Even if list is same, activation might need update if range changed
    activateCharacters(startChapter, startParagraph, getCurrentBookSlug(), endChapter, endParagraph, true);
    return;
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
  // Start preloading assets early
  // preloadInitialAssets();

  // Check for saved position
  const savedPosition = getSavedLocation();

  // Initialize the viewer
  initializePages();

  // Scroll to the saved position
  setTimeout(() => {
    goToParagraph(savedPosition.chapter, savedPosition.paragraph);
  }, 100);
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

// Toggle night mode
export function toggleNightMode() {
  setIsNightMode(!isNightMode());
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

  // Handle other keyboard navigation
  switch (event.key) {
    case "Escape":
      // Cancel page number input on Escape

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

function activateCharacters(chapterNum: number, paragraphNum: number, bookSlug: string, endChapter?: number, endParagraph?: number, onlyTalking = false) {
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
            // Empty block removed
          }
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
        console.log("are we in this weird !onlyTalking case?", canonicalName);
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

  // --- Add Click Listener for Mobile Note Modals ---
  contentContainer.addEventListener("click", (event) => {
    console.log("1148 Clicked on", event.target);
    const target = event.target as HTMLElement;
    const linkNote = target.classList.contains("link-note") ? target : (target.closest(".link-note") as HTMLElement | null);

    if (linkNote) {
      console.log("1148 linkNote", linkNote);
      const rightNotesContainer = document.getElementById("right-notes-container");
      // Check if right notes are hidden (mobile view)
      const isMobileView = rightNotesContainer && getComputedStyle(rightNotesContainer).display === "none";

      event.preventDefault(); // Prevent default link navigation/jump

      const targetId = linkNote.getAttribute("href")?.substring(1); // Get href like '#fn3' and remove '#'
      if (targetId) {
        console.log("1148 targetId", targetId);
        const noteElement = document.getElementById(targetId);
        if (noteElement) {
          console.log("1148 noteElement", noteElement);
          // --- Modal Logic ---
          // Reuse or create modal elements
          let modal = document.getElementById("note-modal");
          let modalContent = document.getElementById("note-modal-content");
          let modalClose = document.getElementById("note-modal-close");
          let modalOverlay = document.getElementById("note-modal-overlay");

          const closeModal = () => {
            if (modal) modal.classList.remove("visible");
            if (modalOverlay) modalOverlay.classList.remove("visible");
            // Remove body class to allow scrolling again
            document.body.classList.remove("modal-open");
          };

          if (!modal) {
            console.log("1148 modal create", modal);
            // Create modal structure if it doesn't exist
            modalOverlay = document.createElement("div");
            modalOverlay.id = "note-modal-overlay";
            modalOverlay.onclick = closeModal; // Close on overlay click

            modal = document.createElement("div");
            modal.id = "note-modal";
            // modal.style.display = 'none'; // Let CSS handle initial display

            const modalDialog = document.createElement("div");
            modalDialog.id = "note-modal-dialog";

            modalClose = document.createElement("button");
            modalClose.id = "note-modal-close";
            modalClose.innerHTML = "&times;"; // Close symbol
            modalClose.onclick = closeModal; // Close on button click

            modalContent = document.createElement("div");
            modalContent.id = "note-modal-content";

            modalDialog.appendChild(modalClose);
            modalDialog.appendChild(modalContent);
            modal.appendChild(modalDialog);
            document.body.appendChild(modalOverlay);
            document.body.appendChild(modal);
          }

          // Ensure elements were found or created and assign content/display
          if (modal && modalContent && modalOverlay && modalClose) {
            console.log("1148 modalContent display", modalContent);
            // Replace potential space before the editorial note with a non-breaking space
            // and wrap the note itself to prevent internal breaks.
            const originalHTML = noteElement.innerHTML;
            const modifiedHTML = originalHTML
              .replace(/\s*(\[przypis edytorski\])/g, ' <br/><p class="przypis"><span style="white-space: nowrap;">$1</span></p>')
              .replace(/\s*(\[przypis autorski\])/g, ' <br/><p class="przypis"><span style="white-space: nowrap;">$1</span></p>');
            modalContent.innerHTML = modifiedHTML; // Use innerHTML to preserve formatting
            modal.classList.add("visible"); // Use class
            modalOverlay.classList.add("visible"); // Use class
            // Add body class to prevent background scrolling
            document.body.classList.add("modal-open");
          }
        }
      }
    }
  });
  // --- End Click Listener ---
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
