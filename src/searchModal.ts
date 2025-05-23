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

export function performLocalDOMSearch(query: string, currentLocation: Location): SearchResultsData {
  // Changed return type
  const items: SearchResultItemData[] = [];
  const queryLower = query.toLowerCase();
  let resultIndex = 0; // For unique ID generation

  try {
    for (let chapterIndex = 0; chapterIndex <= currentLocation.chapter; chapterIndex++) {
      const pageElement = document.querySelector(`section[data-chapter="${chapterIndex}"]`);
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
