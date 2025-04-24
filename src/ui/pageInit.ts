import { setupPageObserver } from "./pageObserver";
import { setupMobileInteractions } from "./mobileUI";
import { getSavedLocation, goToInitialLocationFromHash, goToParagraph } from "../helpers/paragraphsNavigation";

// Initialize pages
export function initializePages() {
  // Set up intersection observer to detect visible pages
  setupPageObserver();

  // Set up mobile interactions
  setupMobileInteractions();
}

// Initialize the viewer and fetch initial metadata
export async function initPage() {
  initializePages();

  // Scroll to the saved position
  setTimeout(() => {
    goToInitialLocationFromHash();
  }, 100);
}
