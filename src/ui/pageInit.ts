import { setupPageObserver } from "./pageObserver";
import { setupMobileInteractions } from "./mobileUI";
import { getSavedLocation, goToInitialLocationFromHash, goToParagraph } from "../helpers/paragraphsNavigation";
import { faraonBookXml } from "../data/faraon-book-xml";
import { faraonAnnotationsXml } from "../data/faraon-annotations-xml";

// Initialize pages
export function initializePages() {
  const bookXml = faraonBookXml;

  const contentContainer = document.getElementById("content-container");
  if (contentContainer) {
    contentContainer.innerHTML = bookXml;
  }

  const rightNotesScrollableContainer = document.getElementById("right-notes-scrollable-container");
  if (rightNotesScrollableContainer) {
    rightNotesScrollableContainer.innerHTML = faraonAnnotationsXml;
  }
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
