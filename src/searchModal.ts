import { searchParagraphsFromServer } from "./utils/searchParagraphsFromServer";
import type { Location } from "@/state/LocationContext";
import { getCharactersData } from "./genericBookDataGetters/getCharactersData";
import { useBookContentStore } from "./stores/bookContent.store";

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
const createContextualSummary = (fullText: string, query: string, maxLength: number = 150): string => {
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

export function performCachedSearch(query: string, currentLocation: Location): SearchResultsData {
  const { textCache, isInitialized } = useBookContentStore.getState();

  const items: SearchResultItemData[] = [];
  const queryLower = query.toLowerCase();

  if (!query.trim()) {
    return { header: "Please enter a search term.", items: [], isLoading: false };
  }

  if (!isInitialized) {
    return { header: "Book content is being indexed, please try again shortly.", items: [], isLoading: true };
  }

  // Iterate over cached chapters
  for (const chapterId in textCache) {
    const chapterIdNum = parseInt(chapterId, 10);
    // Only search up to the current location
    if (chapterIdNum > currentLocation.chapter) continue;

    const chapterCache = textCache[chapterIdNum];
    // Iterate over cached paragraphs
    for (const pIndex in chapterCache) {
      const paragraphNumber = parseInt(pIndex, 10);

      if (chapterIdNum === currentLocation.chapter && paragraphNumber > currentLocation.paragraph) {
        continue;
      }

      const paragraphText = chapterCache[pIndex];
      if (paragraphText.toLowerCase().includes(queryLower)) {
        items.push({
          chapter: chapterIdNum,
          paragraphNumber: paragraphNumber,
          summary: createContextualSummary(paragraphText, query),
          id: `cached-search-${chapterIdNum}-${paragraphNumber}-${Date.now()}`,
        });
      }
    }
  }

  const totalMatches = items.length;
  const header = totalMatches > 0 ? `Found ${totalMatches} match(es) in read text for "${query}"` : `No matches found in read text for "${query}"`;

  return { header, items: items.sort((a, b) => a.chapter - b.chapter || a.paragraphNumber - b.paragraphNumber), isLoading: false };
}

export function cleanupSearchChapters(): void {
  const searchContainer = document.getElementById("search-chapters-container");
  if (searchContainer) {
    searchContainer.remove();
  }
}

const getSentenceWithCharacterSpan = (paragraph: string, characterSlug: string) => {
  // Remove span tags with dynamic IDs like ch1-p1-s1
  // We are getting here paragraph like: "/n       <span id='ch1-p1-s1' ..."
  const paragraphWithoutSpans = paragraph
    .replace("\n", "")
    .trim()
    .replace(/<span id="ch\d+-p\d+-s\d+"[^>]*>(.*)<\/span>/g, "$1");

  const sentences = paragraphWithoutSpans
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
            const summaryText = cleanText.length > 300 ? cleanText.substring(0, 300) : cleanText;
            const displayText = summaryText.length > 300 ? summaryText.substring(0, 300) : summaryText;

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
