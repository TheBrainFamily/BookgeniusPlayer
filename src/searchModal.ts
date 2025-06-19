import { searchParagraphsFromServer } from "./utils/searchParagraphsFromServer";
import type { Location } from "@/state/LocationContext";
import { getCharactersData } from "./genericBookDataGetters/getCharactersData";

export interface SearchResultItemData {
  chapter: number;
  paragraphNumber: number;
  summary: string;
  text?: string;
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
 * Highlights search string found in text by wrapping it with <mark> tags
 */
const highlightMatchedWords = (text: string, query: string): string => {
  if (!query.trim()) return text;

  // Escape special regex characters in the query
  const escapedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Create regex pattern to match the search string (case insensitive)
  const pattern = new RegExp(escapedQuery, "gi");

  // Replace matched text with highlighted version using theme-appropriate colors
  return text.replace(pattern, '<mark class="bg-book-secondary-20 text-white font-semibold rounded-sm shadow-sm">$&</mark>');
};

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
      text: createContextualSummary(match.text, query, 75),
      id: `search-result-${match.chapter}-${match.paragraphNumber}-${index}-${Date.now()}`,
    }));

    return { header, items, isLoading: false };
  } catch (error) {
    console.error("Search error in performUnifiedSearch:", error);
    return { header: "Search failed. Please try again.", items: [], isLoading: false };
  }
}

/**
 * Creates a summary that starts 20 characters before the found text with highlighting
 */
const createContextualSummary = (fullText: string, query: string, maxLength: number = 75): string => {
  const queryLower = query.toLowerCase();
  const fullTextLower = fullText.toLowerCase();

  const matchIndex = fullTextLower.indexOf(queryLower);
  if (matchIndex === -1) {
    // Fallback to original behavior if query not found, but still apply highlighting
    const truncated = fullText.length > maxLength ? `${fullText.substring(0, maxLength)}...` : fullText;
    return highlightMatchedWords(truncated, query);
  }

  // Start 20 characters before the match, but not before the beginning
  const contextStart = Math.max(0, matchIndex - 20);

  // Calculate end position to maintain roughly the same summary length
  const remainingLength = maxLength - (matchIndex - contextStart) - query.length;
  const contextEnd = Math.min(fullText.length, matchIndex + query.length + remainingLength);

  let summary = fullText.substring(contextStart, contextEnd);

  // Add ellipsis if we're not starting from the beginning
  if (contextStart > 0) {
    summary = `...${summary}`;
  }

  // Add ellipsis if we're not ending at the end
  if (contextEnd < fullText.length) {
    summary = `${summary}...`;
  }

  // Apply highlighting to the matched words
  return highlightMatchedWords(summary, query);
};

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
          const summaryText = createContextualSummary(fullText, query);

          items.push({
            chapter: chapterIndex,
            paragraphNumber: paragraphNumber,
            summary: summaryText,
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

const getSentenceWithCharacterSpan = (paragraph: string, characterSlug: string) => {
  const sentences = paragraph
    .split(/(?<=[.!?])\s+(?=[A-Z<])/) // Split on sentence endings while preserving HTML tags
    .map((s) => s.trim()) // Trim whitespace
    .filter((s) => s.length > 0); // Remove empty sentence

  return sentences.reduce((acc, sentence) => {
    if (sentence.includes(`data-character="${characterSlug}"`)) {
      // Find the character's position in the original sentence
      const characterIndex = sentence.indexOf(`data-character="${characterSlug}"`);
      if (characterIndex !== -1) {
        // Get the text before the character tag
        const beforeCharacter = sentence.substring(0, characterIndex);
        // Get the text after the character tag
        const afterCharacter = sentence.substring(characterIndex);

        // Split into words and get context
        const words = beforeCharacter.split(/\s+/);
        const startIndex = Math.max(0, words.length - 5); // Get 5 words before character
        const contextBefore = words.slice(startIndex).join(" ");

        // Combine with the character and what follows
        const contextualSentence = startIndex > 0 ? `...${contextBefore}${afterCharacter}` : `${contextBefore}${afterCharacter}`;

        if (acc.length === 0) {
          return contextualSentence;
        }
        return `${acc} ${contextualSentence}`;
      }

      // Fallback to original behavior if we can't find the character position
      if (acc.length === 0) {
        return sentence;
      }
      return `${acc} ${sentence}`;
    }
    // If we haven't found the character yet, keep looking
    if (acc.length === 0) {
      return acc;
    }
    // If we already have text with the character, add the rest of the text
    return `${acc} ${sentence}`;
  }, "");
};

export function findCharacterSentences(characterSlug: string, currentLocation: Location) {
  const characterData = getCharactersData().find((character) => character.slug === characterSlug);

  // Changed return type
  const items: SearchResultItemData[] = [];
  let resultIndex: 0;

  try {
    if (characterData) {
      const knownCharacterHistory: { chapter: number; paragraphs: number[] }[] = [];
      const hasHistoryTillCurrentChapter = characterData.infoPerChapter.filter((characterInfo) => characterInfo.chapter <= currentLocation.chapter);

      if (hasHistoryTillCurrentChapter) {
        hasHistoryTillCurrentChapter.forEach((infoPerChapter) => {
          if (infoPerChapter.chapter < currentLocation.chapter) {
            knownCharacterHistory.push({ chapter: infoPerChapter.chapter, paragraphs: infoPerChapter.paragraphsWhereSpotted });
          } else {
            const historyTillCurrentParagraph = infoPerChapter.paragraphsWhereSpotted.filter((paragraph) => paragraph <= currentLocation.paragraph);
            knownCharacterHistory.push({ chapter: infoPerChapter.chapter, paragraphs: historyTillCurrentParagraph });
          }
        });
      }

      knownCharacterHistory.forEach(({ chapter, paragraphs }) => {
        paragraphs.forEach((paragraph) => {
          const paragraphInnerHTML = document.querySelector(`section[data-chapter="${chapter}"] [data-index="${paragraph}"]`).innerHTML;

          const sentence = getSentenceWithCharacterSpan(paragraphInnerHTML, characterSlug);

          if (sentence) {
            const cleanText = sentence.replace(/<[^>]*>/g, "");
            const summaryText = cleanText.length > 200 ? cleanText.substring(0, 200) : cleanText;
            const displayText = summaryText.length > 200 ? summaryText.substring(0, 200) : summaryText;

            items.push({
              chapter,
              paragraphNumber: paragraph,
              summary: highlightMatchedWords(summaryText, characterSlug),
              text: highlightMatchedWords(displayText, characterSlug),
              id: `local-dom-search-${chapter}-${paragraph}-${resultIndex++}-${Date.now()}`,
            });
          }
        });
      });
    }
  } catch (error) {
    console.error("Error in performLocalDOMSearch:", error);
    // Return SearchResultsData structure on error
    return { header: `Error performing local search for "${characterSlug}".`, items: [], isLoading: false };
  }

  // Construct SearchResultsData object for successful search
  const totalMatches = items.length;
  let header = "";
  if (totalMatches > 0) {
    header = `Found ${totalMatches} local match(es) for "${characterSlug}" (context: Ch. ${currentLocation.chapter}, P. ${currentLocation.paragraph})`;
  } else {
    header = `No local matches found for "${characterSlug}" (context: Ch. ${currentLocation.chapter}, P. ${currentLocation.paragraph})`;
  }

  return { header, items, isLoading: false };
}
