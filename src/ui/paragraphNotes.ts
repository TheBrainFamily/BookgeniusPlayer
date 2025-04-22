import { ParsedParagraphRange, paragraphMetadataServicePure, getParagraphRange, parseParagraphRange } from "../fetchers/getParagraphRange";
import { dealWithAnnotations } from "./annotations";
import { dealWithBackground } from "./background";
import { dealWithCutScenes } from "../deal-with-cut-scenes";
import { getCurrentBookSlug } from "../getCurrentBookSlug";
import { createEditableEntity } from "../utils/sidebarEditor";
import { activateCharacters } from "./characterHelpers";
import { createMobileCharacterStrip, isMobile } from "./mobileUI";
import { toggleMobileNotes } from "./mobileUI";

// Track previous state to optimize updates
let previousCharacters: string[] = [];
let isUpdatingNotes = false; // Flag to prevent overlapping updates
let updateNotesDebounce: NodeJS.Timeout | null = null;

// The main update function that will be called from page observer
export async function updateParagraphNotes({
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

// The internal implementation of paragraph notes updating
export async function updateParagraphNotesInternal({
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
