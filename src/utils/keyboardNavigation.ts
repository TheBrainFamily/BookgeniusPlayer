import { isEditActive } from "./sidebarEditor";
import { hideSearchModal, isSearchActive, showSearchModal } from "../searchModal";

// Handle keyboard navigation events
export async function keyboardNavigationSetup(event: KeyboardEvent) {
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
    case "Escape": {
      // Cancel page number input on Escape

      // Close notes panel if open on mobile
      const isMobileNotesVisible = document.body.classList.contains("notes-visible");
      if (isMobileNotesVisible) {
        const leftNotes = document.getElementById("left-notes");
        if (leftNotes) {
          leftNotes.classList.remove("active");
          document.body.classList.remove("notes-visible");
          const notesOverlay = document.getElementById("notes-overlay");
          if (notesOverlay) {
            notesOverlay.classList.remove("active");
          }
        }
      }

      // Close any active modals
      document.querySelectorAll(".modal-overlay.active").forEach((modal) => {
        modal.classList.remove("active");
      });
      break;
    }
  }
}

// Set up keyboard event listeners
export function setupKeyboardNavigation() {
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
}
