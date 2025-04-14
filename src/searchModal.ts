import { goToParagraph, getCurrentLocation } from "@/src/helpers/paragraphsNavigation";

// Create search modal elements
let searchModal: HTMLDivElement;
let searchInput: HTMLInputElement;
let searchButton: HTMLButtonElement;
let searchResults: HTMLDivElement;
let searchModalClose: HTMLElement;

// State for the search functionality
let isSearchModalActive = false;
let lastSearchQuery = "";

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
        <div class="search-input-container">
          <input type="text" id="search-input" placeholder="Search text...">
          <button id="search-button">Search</button>
        </div>
        <div id="search-results"></div>
      </div>
    </div>
  `;

  // Append modal to document
  document.body.appendChild(searchModal);

  // Get references to elements
  searchModalClose = searchModal.querySelector(".modal-close")!;
  searchInput = document.getElementById("search-input") as HTMLInputElement;
  searchButton = document.getElementById("search-button") as HTMLButtonElement;
  searchResults = document.getElementById("search-results") as HTMLDivElement;

  // Add event listeners
  searchModalClose.addEventListener("click", hideSearchModal);
  // Add input event listener to search as you type
  searchInput.addEventListener("input", (e) => {
    const query = (e.target as HTMLInputElement).value;
    if (query.trim().length > 3) {
      // Only search if at least 3 characters
      performSearch(query);
    } else if (query.trim().length === 0) {
      // Clear results if search box is emptied
      searchResults.innerHTML = "";
      lastSearchQuery = "";
    }
  });
  searchButton.addEventListener("click", () => performSearch(searchInput.value));
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      performSearch(searchInput.value);
    }
  });

  // Add styles
  addSearchModalStyles();
}

/**
 * Add CSS styles for the search modal
 */
function addSearchModalStyles() {
  const styleId = "search-modal-styles";

  // Only add styles once
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .search-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s, visibility 0.3s;
    }
    
    .search-modal.active {
      opacity: 1;
      visibility: visible;
    }
    
    .search-modal .modal-content {
      width: 80%;
      max-width: 700px;
      max-height: 80vh;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .search-modal .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      border-bottom: 1px solid #eee;
    }
    
    .search-modal .modal-header h3 {
      margin: 0;
      font-size: 18px;
    }
    
    .search-modal .modal-close {
      font-size: 24px;
      cursor: pointer;
      color: #666;
    }
    
    .search-modal .modal-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }
    
    .search-input-container {
      display: flex;
      margin-bottom: 20px;
      gap: 8px;
    }
    
    #search-input {
      flex: 1;
      padding: 10px 15px;
      font-size: 16px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    
    #search-button {
      padding: 10px 20px;
      background-color: #4a90e2;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    }
    
    #search-button:hover {
      background-color: #3a80d2;
    }
    
    .search-result-item {
      padding: 15px;
      margin-bottom: 15px;
      border-bottom: 1px solid #eee;
      cursor: pointer;
      border-radius: 4px;
      transition: background-color 0.2s;
    }
    
    .search-result-item:hover {
      background-color: #f5f9ff;
    }
    
    .search-result-page {
      font-weight: bold;
      margin-bottom: 8px;
      color: #4a90e2;
    }
    
    .search-result-content {
      line-height: 1.5;
    }
    
    .search-highlight {
      background-color: yellow;
      font-weight: bold;
      border-radius: 2px;
      padding: 0;
    }
    
    .highlight-paragraph {
      animation: highlight-fade 2s;
    }
    
    .search-results-header {
      padding: 12px 15px;
      margin-bottom: 20px;
      background-color: #f0f7ff;
      border-radius: 4px;
      font-weight: bold;
      border-left: 4px solid #4a90e2;
    }
    
    @keyframes highlight-fade {
      from { background-color: #ffff8d; }
      to { background-color: transparent; }
    }
    
    /* Night mode styles */
    body.night-mode .search-modal .modal-content {
      background-color: #222;
      color: #eee;
    }
    
    body.night-mode .search-modal .modal-header {
      border-bottom-color: #444;
    }
    
    body.night-mode .search-modal .modal-close {
      color: #aaa;
    }
    
    body.night-mode #search-input {
      background-color: #333;
      color: #fff;
      border-color: #555;
    }
    
    body.night-mode .search-result-item {
      border-bottom-color: #444;
    }
    
    body.night-mode .search-result-item:hover {
      background-color: #333;
    }
    
    body.night-mode .search-results-header {
      background-color: #2a3542;
      border-left-color: #6a90b2;
      color: #ccc;
    }
    
    body.night-mode .search-highlight {
      background-color: #b58900;
      color: #000;
    }
    
    @keyframes highlight-fade-night {
      from { background-color: #b58900; }
      to { background-color: transparent; }
    }
    
    body.night-mode .highlight-paragraph {
      animation: highlight-fade-night 2s;
    }
    
    /* Mobile styles */
    @media (max-width: 768px) {
      .search-modal .modal-content {
        width: 95%;
        max-height: 85vh;
      }
      
      #search-input, #search-button {
        font-size: 14px;
      }
    }
  `;

  document.head.appendChild(style);
}

let preSearchLocation = { chapter: 0, paragraph: 0 };
/**
 * Show the search modal
 */
export function showSearchModal() {
  if (!searchModal) {
    initSearchModal();
  }

  preSearchLocation = getCurrentLocation();
  searchModal.classList.add("active");
  isSearchModalActive = true;
  searchInput.value = lastSearchQuery;

  // Add a small delay to ensure focus happens after the modal is visible
  setTimeout(() => {
    searchInput.focus();
  }, 50);

  // If there was a previous search, execute it again
  if (lastSearchQuery) {
    performSearch(lastSearchQuery);
  }
}

/**
 * Hide the search modal
 */
export function hideSearchModal() {
  if (!searchModal) return;

  searchModal.classList.remove("active");
  isSearchModalActive = false;
  // Create a return button to go back to pre-search location
  const returnButton = document.getElementById("return-to-location-button");
  returnButton.addEventListener("click", () => {
    goToParagraph(preSearchLocation.chapter, preSearchLocation.paragraph);
    preSearchLocation = { chapter: 0, paragraph: 0 };
    returnButton.style.display = "none";
  });

  // Show the button if we have a valid pre-search location
  setTimeout(() => {
    const currentLocation = getCurrentLocation();
    if (preSearchLocation.chapter !== currentLocation.chapter || preSearchLocation.paragraph !== currentLocation.paragraph) {
      returnButton.style.display = "block";
    }
  }, 100);
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
export function performSearch(query: string) {
  if (!query.trim()) return;

  lastSearchQuery = query;
  const currentLocation = getCurrentLocation();
  searchResults.innerHTML = "";

  // Counter for matches
  let totalMatches = 0;

  // Go through each page up to the current one
  for (let i = 0; i <= currentLocation.chapter; i++) {
    const pageElement = document.querySelector(`section[data-chapter="${i}"]`);
    console.log("pageElement", pageElement);
    if (!pageElement) continue;

    // const pageText = pageElement.textContent || "";

    // Skip if no match in this page
    // if (!pageText.toLowerCase().includes(query.toLowerCase())) continue;

    // Get paragraphs from this page
    const paragraphs = pageElement.querySelectorAll(`p[data-index]`);

    // For each paragraph, check if it contains the search term
    paragraphs.forEach((paragraph) => {
      // Clone the paragraph to avoid modifying the original
      const paragraphClone = paragraph.cloneNode(true) as HTMLElement;

      // Remove all anchor elements from the clone
      const anchors = paragraphClone.querySelectorAll("a.anchor");
      anchors.forEach((anchor) => anchor.remove());

      // Get clean text content without anchors
      const paragraphText = paragraphClone.textContent || "";

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
          goToParagraph(i, parseInt(paragraph.getAttribute("data-index") || "0"));
          hideSearchModal();

          // Find and highlight the paragraph on the page
          setTimeout(() => {
            // Find paragraphs on the page and locate the one that contains the text
            const pageParagraphs = document.querySelectorAll(`section[data-chapter="${i}"] p[data-index]`);
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

  // Display summary of results
  const resultsHeader = document.createElement("div");
  resultsHeader.className = "search-results-header";

  if (totalMatches > 0) {
    resultsHeader.textContent = `Found ${totalMatches} matches for "${query}" in pages up to chapter ${currentLocation.chapter}, paragraph ${currentLocation.paragraph}`;
  } else {
    resultsHeader.textContent = `No matches found for "${query}" in pages up to chapter ${currentLocation.chapter}, paragraph ${currentLocation.paragraph}`;
  }

  searchResults.insertBefore(resultsHeader, searchResults.firstChild);
}
