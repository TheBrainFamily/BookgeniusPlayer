import { setupPageObserver } from "./pageObserver";
import { setupMobileInteractions } from "./mobileUI";
import { getSavedLocation, goToParagraph } from "../helpers/paragraphsNavigation";

// Initialize pages
export function initializePages() {
  // Set up intersection observer to detect visible pages
  setupPageObserver();

  // Set up mobile interactions
  setupMobileInteractions();
}

// Initialize the viewer and fetch initial metadata
export async function initPage() {
  // Check for saved position
  const savedPosition = getSavedLocation();

  // Initialize the viewer
  initializePages();

  // Scroll to the saved position
  setTimeout(() => {
    goToParagraph(savedPosition.chapter, savedPosition.paragraph);
  }, 100);
}
