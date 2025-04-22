import "./styles.css";
import "./styles-narrow.css";
import "./globals.css";
import "./main.css";

import { isNightMode, setIsNightMode } from "./helpers/setIsNightMode";
import { isMobileCharactersVisible } from "./isMobileCharactersVisible";
import { startReactComponents } from "./react-components";
import { initSearchModal } from "./searchModal";
import { initializeNoteLinkBlinking } from "./annotationsHandling";

// Import the extracted modules
import { dealWithSW } from "./serviceWorker";
import { setUpdateParagraphNotesFunction } from "./ui/pageObserver";
import { updateParagraphNotes } from "./ui/paragraphNotes";
import { setupParagraphHighlighting } from "./ui/paragraphHighlighting";
import { setupKeyboardNavigation } from "./utils/keyboardNavigation";
import { initPage } from "./ui/pageInit";
import { initCharacterModals, showCharacterDetailsModal } from "./ui/characterModals";

// Set the update notes function for the page observer
setUpdateParagraphNotesFunction(updateParagraphNotes);

// Initialize service worker
dealWithSW();

// DOM elements
const loadingIndicator = document.getElementById("loading");

// Toggle night mode
export function toggleNightMode() {
  setIsNightMode(!isNightMode());
}

// Start the initialization process
initPage()
  .catch((error) => {
    console.error("Error initializing page:", error);
    if (loadingIndicator) {
      loadingIndicator.innerHTML = "<div>Error loading book. Please refresh the page.</div>";
    }
  })
  .then(() => {
    console.log("container exists?", document.getElementById("content-container"));
    // Add scroll event listener to update notes based on visible pages
    const contentContainer = document.getElementById("content-container");
    if (contentContainer) {
      contentContainer.addEventListener("scroll", () => {
        // Scroll handling is now in paragraphHighlighting.ts
      });
    }
  });

// Add the characters-hidden class to body initially if the character strip is hidden
document.getElementById("legacy")?.classList.toggle("characters-hidden", !isMobileCharactersVisible());

// Initialize everything when DOM is loaded
function onDOMLoaded() {
  initializeNoteLinkBlinking();

  if (localStorage.getItem("nightMode") === "true") {
    setIsNightMode(true);
  }

  // Initialize search modal
  initSearchModal();

  // Initialize character modals
  initCharacterModals();

  // Add event listeners for closing modals
  document.querySelectorAll(".modal-close").forEach((button) => {
    const modal = button.closest(".modal-overlay");
    if (modal) {
      button.addEventListener("click", () => {
        modal.classList.remove("active");
      });
    }
  });

  // Setup keyboard navigation
  setupKeyboardNavigation();

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
