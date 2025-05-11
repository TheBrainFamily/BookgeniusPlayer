import { ParsedParagraphRange } from "@/fetchers/getParagraphRange";
import { isMobileCharactersVisible } from "@/isMobileCharactersVisible";
import { showCharacterDetailsModal } from "./characterModals";

// Function to check if the device is mobile
export function isMobile() {
  return false;
}

// Global state for mobile UI
let isMobileNotesVisible = false; // Track if notes panel is open on mobile

// Toggle mobile notes panel
export function toggleMobileNotes() {
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
export function setupMobileInteractions() {
  const contentContainer = document.getElementById("content-container");
  if (contentContainer) {
    contentContainer.addEventListener("click", () => {
      if (isMobile() && isMobileNotesVisible) {
        toggleMobileNotes();
      }
    });
  }
}

// Create or update the mobile character strip
export function createMobileCharacterStrip(characters: ParsedParagraphRange[]) {
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
  notesIcon.className = "mobile-notes-icon";
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
