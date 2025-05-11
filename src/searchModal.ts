import debounce from "lodash.debounce";

import "./searchModal.css";
import { goToParagraph, getCurrentLocation } from "@/helpers/paragraphsNavigation";
import type { Location } from "@/state/LocationContext";
import { searchParagraphsFromServer } from "./utils/searchParagraphsFromServer";

// Create a debounced version of the server search portion of performSearch
const performServerSearch = debounce(
  async (query: string, currentLocation: Location, searchResults: HTMLDivElement) => {
    const serverMatches = await searchParagraphsFromServer(query, currentLocation);
    const totalServerMatches = serverMatches.length;

    // Clear previous results before adding new ones
    searchResults.innerHTML = "";

    // Display summary of results
    const resultsHeader = document.createElement("div");
    resultsHeader.className = "search-results-header";

    if (totalServerMatches > 0) {
      resultsHeader.textContent = `Found ${totalServerMatches} places matching "${query}" in pages up to chapter ${currentLocation.chapter}, paragraph ${currentLocation.paragraph}`;
    } else {
      resultsHeader.textContent = `No matches found for "${query}" in pages up to chapter ${currentLocation.chapter}, paragraph ${currentLocation.paragraph}`;
    }

    searchResults.appendChild(resultsHeader);

    serverMatches.forEach((match) => {
      const resultItem = document.createElement("div");
      resultItem.className = "search-result-item";

      // Limit text to first 75 characters
      const textPreview = match.text.length > 75 ? `${match.text.substring(0, 75)}...` : match.text;

      resultItem.innerHTML = `
      <div class="search-result-page">Chapter ${match.chapter}, Paragraph ${match.paragraphNumber}</div>
      <div class="search-result-summary">${match.summary}</div>
      <div class="search-result-content">${textPreview}</div>
    `;

      // Add click event to navigate to this paragraph
      resultItem.addEventListener("click", () => {
        goToParagraph({ chapter: match.chapter, paragraph: match.paragraphNumber, endChapter: match.chapter, endParagraph: match.paragraphNumber });
        hideSearchModal();

        // Find and highlight the paragraph on the page
        setTimeout(() => {
          const targetParagraph = document.querySelector(`section[data-chapter="${match.chapter}"] [data-index="${match.paragraphNumber}"]`);

          if (targetParagraph) {
            targetParagraph.scrollIntoView({ behavior: "smooth", block: "center" });
            targetParagraph.classList.add("highlight-paragraph");
            setTimeout(() => targetParagraph.classList.remove("highlight-paragraph"), 2000);
          }
        }, 300);
      });

      searchResults.appendChild(resultItem);
    });

    // Hide the loader when search is complete
    searchLoader.classList.add("hidden");
  },
  350,
  {
    leading: false, // Don't execute immediately
    trailing: true, // Execute after delay
  },
);

// Create search modal elements
let searchModal: HTMLDivElement;
let searchResults: HTMLDivElement;
let searchModalClose: HTMLElement;
let searchLoader: HTMLDivElement; // Add loader element

// State for the search functionality
let isSearchModalActive = false;
let lastSearchQuery = "";
let lastSearchTimestamp = 0; // Track when the last search was performed

/**
 * Initialize the search modal and append it to the document
 */
export function initSearchModal() {
  // Create modal element if it doesn't exist
  if (document.getElementById("search-modal")) return;

  // Create the modal element
  searchModal = document.createElement("div");
  searchModal.className = "modal-overlay search-modal";
  searchModal.id = "search-modal";
  searchModal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Search Results</h3>
        <span class="modal-close">&times;</span>
      </div>
      <div class="modal-body">

        <div id="search-loader" class="search-loader hidden">
          <div class="loader-spinner"></div>
          <div class="loader-text">Searching...</div>
        </div>
        <div id="search-results"></div>
      </div>
    </div>
  `;

  // Append modal to document
  document.body.appendChild(searchModal);

  // Get references to elements
  searchModalClose = searchModal.querySelector(".modal-close")!;
  searchResults = document.getElementById("search-results") as HTMLDivElement;
  searchLoader = document.getElementById("search-loader") as HTMLDivElement;

  // Add event listeners
  searchModalClose.addEventListener("click", hideSearchModal);
}

/**
 * Show the search modal
 */
export function showSearchModal() {
  if (!searchModal) {
    initSearchModal();
  }

  // Force layout recalculation
  void searchModal.offsetHeight;

  // First make sure the modal is properly positioned
  searchModal.style.display = "flex";
  searchModal.style.justifyContent = "center";
  searchModal.style.alignItems = "center";

  // Then make it visible
  setTimeout(() => {
    searchModal.classList.add("active");
    isSearchModalActive = true;

    // If there was a previous search within the last 5 minutes, execute it again
    const fiveMinutesInMs = 5 * 60 * 1000;
    const currentTime = Date.now();
    if (lastSearchQuery && currentTime - lastSearchTimestamp < fiveMinutesInMs) {
      performSearch(lastSearchQuery);
    }
  }, 50);
}

/**
 * Hide the search modal
 */
export function hideSearchModal() {
  if (!searchModal) return;

  searchModal.classList.remove("active");
  isSearchModalActive = false;
}

/**
 * Check if the search modal is currently active
 */
export function isSearchActive() {
  return isSearchModalActive;
}

/**
 * Perform search within book content up to current page
 */
export async function performSearch(query: string) {
  if (!query.trim()) return;

  searchLoader.classList.remove("hidden");

  // For local search, always clear and start fresh
  searchResults.innerHTML = "";

  lastSearchQuery = query;
  lastSearchTimestamp = Date.now(); // Update the timestamp when search is performed
  const currentLocation = getCurrentLocation();

  // Counter for matches
  let totalMatches = 0;

  try {
    // Go through each page up to the current one
    for (let i = 0; i <= currentLocation.chapter; i++) {
      const pageElement = document.querySelector(`section[data-chapter="${i}"]`);
      if (!pageElement) continue;

      // Get paragraphs from this page
      const paragraphs = pageElement.querySelectorAll(`[data-index]`);

      // For each paragraph, check if it contains the search term
      paragraphs.forEach((paragraph) => {
        if (parseInt(paragraph.getAttribute("data-index") || "0", 10) > currentLocation.paragraph && i == currentLocation.chapter) return;
        // Clone the paragraph to avoid modifying the original
        const paragraphClone = paragraph.cloneNode(true) as HTMLElement;

        // Remove all anchor elements from the clone
        const anchors = paragraphClone.querySelectorAll("a.anchor");
        anchors.forEach((anchor) => anchor.remove());

        // Get clean text content without anchors
        const paragraphText =
          paragraphClone.textContent
            ?.replace(/[\n\r]/g, " ")
            .replace(/\s+/g, " ")
            .trim() || "";

        if (paragraphText.toLowerCase().includes(query.toLowerCase())) {
          totalMatches++;

          // Create a result item
          const resultItem = document.createElement("div");
          resultItem.className = "search-result-item";

          // Highlight the matching text in the paragraph
          const highlightedText = paragraphText.replace(new RegExp(query, "gi"), (match) => `<span class="search-highlight">${match}</span>`);

          resultItem.innerHTML = `
            <div class="search-result-page">Chapter ${i}, Paragraph ${paragraph.getAttribute("data-index")}</div>
            <div class="search-result-content">${highlightedText}</div>
          `;

          // Add click event to navigate to this result
          resultItem.addEventListener("click", () => {
            goToParagraph({
              chapter: i,
              paragraph: parseInt(paragraph.getAttribute("data-index") || "0", 10),
              endChapter: i,
              endParagraph: parseInt(paragraph.getAttribute("data-index") || "0", 10),
            });
            hideSearchModal();

            // Find and highlight the paragraph on the page
            setTimeout(() => {
              // Find paragraphs on the page and locate the one that contains the text
              const pageParagraphs = document.querySelectorAll(`section[data-chapter="${i}"] [data-index]`);
              let targetParagraph = null;

              pageParagraphs.forEach((p) => {
                if (p.textContent && p.textContent.includes(paragraphText.substring(0, 30))) {
                  targetParagraph = p;
                }
              });

              if (targetParagraph) {
                targetParagraph.scrollIntoView({ behavior: "smooth", block: "center" });
                targetParagraph.classList.add("highlight-paragraph");
                setTimeout(() => targetParagraph.classList.remove("highlight-paragraph"), 2000);
              }
            }, 300);
          });

          searchResults.appendChild(resultItem);
        }
      });
    }

    // Display summary of results for local search
    if (totalMatches > 0) {
      const resultsHeader = document.createElement("div");
      resultsHeader.className = "search-results-header";
      resultsHeader.textContent = `Found ${totalMatches} matches for "${query}" in pages up to chapter ${currentLocation.chapter}, paragraph ${currentLocation.paragraph}`;
      searchResults.insertBefore(resultsHeader, searchResults.firstChild);
      searchLoader.classList.add("hidden");
    } else {
      // If no local matches, use the debounced server search
      // Cancel any pending searches first

      // Start a new debounced search
      performServerSearch(query, currentLocation, searchResults);

      // Note: The searchLoader will be hidden by performServerSearch when it completes
    }
  } catch (error) {
    console.error("Search error:", error);
    searchLoader.classList.add("hidden");
  }
}
