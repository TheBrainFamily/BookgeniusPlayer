import { searchParagraphsFromServer } from "./utils/searchParagraphsFromServer";
import type { Location } from "@/state/LocationContext"; // Import Location type

export interface SearchResultItemData {
  chapter: number;
  paragraphNumber: number;
  summary: string;
  text: string;
  id: string; // For React keys
}

export interface SearchResultsData {
  header: string;
  items: SearchResultItemData[];
  isLoading?: boolean;
}

// getCurrentLocation would be sourced from your state management, e.g., useLocation hook
// For this file, it's assumed the caller (ModalContext) provides the location.

/**
 * Perform a unified search (primarily server-based in this refactor).
 * Returns structured search result data.
 */
export async function performUnifiedSearch(
  query: string,
  currentLocation: Location, // Use imported Location type
): Promise<SearchResultsData> {
  if (!query.trim()) {
    return { header: "Please enter a search term.", items: [], isLoading: false };
  }

  try {
    const serverMatches = await searchParagraphsFromServer(query, currentLocation);
    const totalServerMatches = serverMatches.length;

    let header = "";
    if (totalServerMatches > 0) {
      // Removed unnecessary escapes for quotes
      header = `Found ${totalServerMatches} match(es) for "${query}" (context: Ch. ${currentLocation.chapter}, P. ${currentLocation.paragraph})`;
    } else {
      header = `No matches found for "${query}" (context: Ch. ${currentLocation.chapter}, P. ${currentLocation.paragraph})`;
    }

    const items: SearchResultItemData[] = serverMatches.map((match, index) => ({
      chapter: match.chapter,
      paragraphNumber: match.paragraphNumber,
      summary: match.summary,
      text: match.text.length > 75 ? `${match.text.substring(0, 75)}...` : match.text,
      id: `search-result-${match.chapter}-${match.paragraphNumber}-${index}-${Date.now()}`,
    }));

    return { header, items, isLoading: false };
  } catch (error) {
    console.error("Search error in performUnifiedSearch:", error);
    return { header: "Search failed. Please try again.", items: [], isLoading: false };
  }
}

export async function performLocalDOMSearch(query: string, currentLocation: Location, bookSlug?: string): Promise<SearchResultsData> {
  // Changed return type
  const items: SearchResultItemData[] = [];
  const queryLower = query.toLowerCase();
  let resultIndex = 0; // For unique ID generation

  try {
    // Get the bookSlug from parameter or from the current page
    let actualBookSlug = bookSlug;
    if (!actualBookSlug) {
      const existingChapterElement = document.querySelector("[data-book-slug]");
      if (!existingChapterElement) {
        return { header: `Error: No chapters found in DOM for search.`, items: [], isLoading: false };
      }
      actualBookSlug = existingChapterElement.getAttribute("data-book-slug") || "book";
    }

    // Create a temporary container for search chapters
    let searchContainer = document.getElementById("search-chapters-container");
    if (!searchContainer) {
      searchContainer = document.createElement("div");
      searchContainer.id = "search-chapters-container";
      searchContainer.style.display = "none"; // Hide from view
      document.body.appendChild(searchContainer);
    }

    // Load chapters that aren't already in the DOM
    const chaptersToLoad: number[] = [];
    const existingChapters = new Set<number>();

    // Check which chapters are already loaded
    document.querySelectorAll("section[data-chapter]").forEach((section) => {
      const chapterNum = parseInt(section.getAttribute("data-chapter") || "0");
      if (chapterNum > 0) {
        existingChapters.add(chapterNum);
      }
    });

    // Determine which chapters need to be loaded for search
    for (let i = 1; i <= currentLocation.chapter; i++) {
      if (!existingChapters.has(i)) {
        chaptersToLoad.push(i);
      }
    }

    // Load missing chapters into the search container
    const loadPromises = chaptersToLoad.map(async (chapterId) => {
      try {
        // Import the chapter module
        const module = await import(`./data/books/${actualBookSlug}/chapters/Chapter${chapterId}.tsx`);
        const ChapterComponent = module.default || module[`Chapter${chapterId}`];

        if (ChapterComponent && typeof ChapterComponent === "function") {
          // Create a temporary div to render the chapter
          const tempDiv = document.createElement("div");
          tempDiv.setAttribute("data-search-chapter", chapterId.toString());
          searchContainer!.appendChild(tempDiv);

          // Use React to render the component
          const { createRoot } = await import("react-dom/client");
          const root = createRoot(tempDiv);
          const React = await import("react");
          root.render(React.createElement(ChapterComponent));

          // Wait a bit for React to render
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      } catch (error) {
        console.error(`Failed to load chapter ${chapterId} for search:`, error);
      }
    });

    // Wait for all chapters to load
    await Promise.all(loadPromises);

    // Now perform the search across all chapters (both existing and newly loaded)
    for (let chapterIndex = 1; chapterIndex <= currentLocation.chapter; chapterIndex++) {
      // Look in both the normal content and the search container
      const selectors = [`section[data-chapter="${chapterIndex}"]`, `[data-search-chapter="${chapterIndex}"] section[data-chapter="${chapterIndex}"]`];

      let pageElement: Element | null = null;
      for (const selector of selectors) {
        pageElement = document.querySelector(selector);
        if (pageElement) break;
      }

      if (!pageElement) continue;

      const paragraphs = pageElement.querySelectorAll<HTMLElement>(`[data-index]`);

      paragraphs.forEach((paragraphElement) => {
        const paragraphNumberAttr = paragraphElement.getAttribute("data-index");
        if (!paragraphNumberAttr) return;

        const paragraphNumber = parseInt(paragraphNumberAttr, 10);

        // Skip paragraphs beyond the current one in the current chapter
        if (chapterIndex === currentLocation.chapter && paragraphNumber > currentLocation.paragraph) {
          return;
        }

        const paragraphClone = paragraphElement.cloneNode(true) as HTMLElement;

        // Remove anchor tags to get clean text
        const anchors = paragraphClone.querySelectorAll("a.anchor");
        anchors.forEach((anchor) => anchor.remove());

        const paragraphText = (paragraphClone.textContent || "")
          .replace(/[\n\r]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (paragraphText.toLowerCase().includes(queryLower)) {
          const fullText = paragraphText;
          const displayText = fullText.length > 75 ? `${fullText.substring(0, 75)}...` : fullText;

          // Use a longer snippet of the text for summary, as local DOM search doesn't have explicit summaries
          const summaryText = fullText.length > 150 ? `${fullText.substring(0, 150)}...` : fullText;

          items.push({
            chapter: chapterIndex,
            paragraphNumber: paragraphNumber,
            summary: summaryText,
            text: displayText,
            id: `local-dom-search-${chapterIndex}-${paragraphNumber}-${resultIndex++}-${Date.now()}`,
          });
        }
      });
    }
  } catch (error) {
    console.error("Error in performLocalDOMSearch:", error);
    // Return SearchResultsData structure on error
    return { header: `Error performing local search for "${query}".`, items: [], isLoading: false };
  }

  // Construct SearchResultsData object for successful search
  const totalMatches = items.length;
  let header = "";
  if (totalMatches > 0) {
    header = `Found ${totalMatches} local match(es) for "${query}" (context: Ch. ${currentLocation.chapter}, P. ${currentLocation.paragraph})`;
  } else {
    header = `No local matches found for "${query}" (context: Ch. ${currentLocation.chapter}, P. ${currentLocation.paragraph})`;
  }

  return { header, items, isLoading: false };
}

export function cleanupSearchChapters(): void {
  const searchContainer = document.getElementById("search-chapters-container");
  if (searchContainer) {
    searchContainer.remove();
  }
}
