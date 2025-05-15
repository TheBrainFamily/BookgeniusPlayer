import { hideSearchModal, isSearchActive } from "@/searchModal";

// Handle keyboard navigation events
export function keyboardNavigationSetup(event: KeyboardEvent) {
  // If search modal is active, let it handle its own keyboard events
  if (isSearchActive()) {
    if (event.key === "Escape") {
      hideSearchModal();
    }
    return;
  }

  // Handle other keyboard navigation
  switch (event.key) {
    case "Escape": {
      // Cancel page number input on Escape

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
  document.addEventListener("keydown", (event) => {
    // Intercept browser search (Cmd+F or Ctrl+F)
    if ((event.key === "f" || event.key === "F") && (event.metaKey || event.ctrlKey)) {
      event.preventDefault(); // Prevent default browser search
      // Focus the bottom input instead of showing the modal
      const bottomInput = document.getElementById("bottom-input");
      if (bottomInput) {
        bottomInput.focus();
      }
      return;
    }

    // Handle Command+S to set page number
    keyboardNavigationSetup(event);
  });
}
