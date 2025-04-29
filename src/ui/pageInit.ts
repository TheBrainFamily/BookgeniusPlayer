import { setupPageObserver } from "./pageObserver";
import { setupMobileInteractions } from "./mobileUI";
import { getSavedLocation, goToInitialLocationFromHash, goToParagraph } from "../helpers/paragraphsNavigation";
// import { faraonBookXml } from "../data/faraon-book-xml"; // Removed import
import { faraonAnnotationsXml } from "../data/faraon-annotations-xml";

// Initialize pages
export function initializePages() {
  // Content injection moved to useBookContent hook

  const rightNotesScrollableContainer = document.getElementById("right-notes-scrollable-container");
  if (rightNotesScrollableContainer) {
    rightNotesScrollableContainer.innerHTML = faraonAnnotationsXml;
  }
  // Set up intersection observer to detect visible pages
  // setupPageObserver(); // This should likely be removed if usePageObserver hook is used
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
