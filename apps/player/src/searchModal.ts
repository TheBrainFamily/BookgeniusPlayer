import { searchParagraphsFromServer } from "./utils/searchParagraphsFromServer";
import type { Location } from "@player/state/LocationContext";
import { getCharactersData } from "./genericBookDataGetters/getCharactersData";
import { useBookContentStore } from "./stores/bookContent.store";
import { getBookData } from "./genericBookDataGetters/getBookData";

export interface SearchResultItemData {
  chapter: number;
  paragraphNumber: number;
  percentInChapter: number;
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

    const items: SearchResultItemData[] = serverMatches.map((match, index) => {
      const totalParagraphsInChapter = getTotalParagraphsInChapter(match.chapter);
      return {
        chapter: match.chapter,
        paragraphNumber: match.paragraphNumber,
        percentInChapter: calculatePercentInChapter(match.paragraphNumber, totalParagraphsInChapter),
        summary: match.summary,
        text: createContextualSummary(match.text, query, 75),
        id: `search-result-${match.chapter}-${match.paragraphNumber}-${index}`,
      };
    });

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
  const bookIsPlay = getBookData().metadata.bookForm === "play";
  let bookCharacters = [];
  if (bookIsPlay) {
    bookCharacters = getCharactersData().map((character) => character.characterName.toLowerCase());
  }

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

    const totalParagraphsInChapter = getTotalParagraphsInChapter(chapterIdNum);

    const chapterCache = textCache[chapterIdNum];
    // Iterate over cached paragraphs
    for (const pIndex in chapterCache) {
      const paragraphNumber = parseInt(pIndex, 10);

      if (chapterIdNum === currentLocation.chapter && paragraphNumber > currentLocation.paragraph) {
        continue;
      }

      let paragraphText = chapterCache[paragraphNumber];
      if (paragraphText.toLowerCase().includes(queryLower)) {
        if (bookIsPlay) {
          // if the paragraph text is just a character name we want to append the next paragraph text to show the character next line
          if (bookCharacters.includes(paragraphText.trim().toLowerCase())) {
            const nextParagraphText = chapterCache[paragraphNumber + 1];

            if (nextParagraphText) {
              paragraphText = `${paragraphText}: ${nextParagraphText}`;
            }
          }
        }

        items.push({
          chapter: chapterIdNum,
          paragraphNumber: paragraphNumber,
          percentInChapter: calculatePercentInChapter(paragraphNumber, totalParagraphsInChapter),
          summary: createContextualSummary(paragraphText, query),
          id: `cached-search-${chapterIdNum}-${paragraphNumber}`,
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

const getTotalParagraphsInChapter = (() => {
  const cache = new Map<number, number>();

  return (chapterNumber: number): number => {
    if (cache.has(chapterNumber)) {
      return cache.get(chapterNumber)!;
    }

    try {
      const chapterSection = document.querySelector(`section[data-chapter="${chapterNumber}"]`);
      if (!chapterSection) {
        cache.set(chapterNumber, 0);
        return 0;
      }
      const count = chapterSection.querySelectorAll("[data-index]").length;
      cache.set(chapterNumber, count);
      return count;
    } catch (error) {
      console.error(`Error getting paragraph count for chapter ${chapterNumber}:`, error);
      // Don't cache on error to allow for retries.
      return 0;
    }
  };
})();

const calculatePercentInChapter = (paragraphNumber: number, totalParagraphs: number): number => {
  if (totalParagraphs <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((paragraphNumber / totalParagraphs) * 100)));
};

const getSentenceWithCharacterSpan = (paragraph: string, characterSlug: string) => {
  // Create a temporary DOM element to properly parse the HTML
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = paragraph;

  const characterElements = tempDiv.querySelectorAll(`[data-character="${characterSlug}"]`);
  if (characterElements.length === 0) {
    return "";
  }

  const results: { html: string; offset: number }[] = [];

  // Compute the character offset of the first text inside target relative to the root's text content
  const getTextOffset = (root: HTMLElement, target: Element): number => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let offset = 0;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (target.contains(node)) {
        break;
      }
      offset += (node.nodeValue || "").length;
    }
    return offset;
  };

  characterElements.forEach((characterElement) => {
    // Find the sentence span that contains this character element
    const sentenceSpan = characterElement.closest('span[id^="ch"][id*="-s"]');

    if (sentenceSpan) {
      // Get the sentence text with HTML intact
      let sentenceHTML = sentenceSpan.outerHTML;

      // Clean up the sentence HTML - remove the id and style attributes
      sentenceHTML = sentenceHTML.replace(/\s*id="[^"]*"/g, "");
      sentenceHTML = sentenceHTML.replace(/\s*style="[^"]*"/g, "");

      results.push({ html: sentenceHTML, offset: getTextOffset(tempDiv, characterElement) });
    } else {
      // Fallback: if no sentence span found, try to get surrounding context
      let context = "";
      let current = characterElement;
      const currentHasNoWrap = current.closest("span.text-nowrap");
      if (currentHasNoWrap) {
        current = currentHasNoWrap;
      }

      // Get up to 10 words before
      let wordsBefore = [];
      let beforeElement = current.previousSibling;

      while (beforeElement && wordsBefore.length < 12) {
        if (beforeElement.nodeType === Node.TEXT_NODE || beforeElement.nodeType === Node.ELEMENT_NODE) {
          const words = beforeElement.textContent
            .trim()
            .split(/\s+/)
            .filter((w) => w);
          wordsBefore.unshift(...words.slice(-12));
        }
        beforeElement = beforeElement.previousSibling;
      }

      const characterHTML = characterElement.outerHTML;

      // Get up to 10 words after
      let wordsAfter = [];
      let afterElement = current.nextSibling;
      while (afterElement && wordsAfter.length < 12) {
        if (afterElement.nodeType === Node.TEXT_NODE || afterElement.nodeType === Node.ELEMENT_NODE) {
          const words = afterElement.textContent
            .trim()
            .split(/\s+/)
            .filter((w) => w);
          wordsAfter.push(...words.slice(0, 12));
        }
        afterElement = afterElement.nextSibling;
      }

      let characterSlugMissingPunctuation = "";
      if (wordsBefore.length === 0 || wordsAfter.length === 0) {
        const words = tempDiv.textContent
          .trim()
          .split(/\s+/)
          .filter((w) => w);

        const characterSlugIndex = words.findIndex((word) => word.includes(characterSlug));
        if (characterSlugIndex !== -1) {
          characterSlugMissingPunctuation = words[characterSlugIndex].replace(characterSlug, "");
          wordsBefore = words.slice(0, characterSlugIndex);
          wordsAfter = words.slice(characterSlugIndex + 1);
        }
      }

      console.log("PINGWING wordsBefore", wordsBefore);
      console.log("PINGWING wordsAfter", wordsAfter);
      console.log("PINGWING characterHTML", characterHTML);
      console.log("PINGWING characterSlugMissingPunctuation", characterSlugMissingPunctuation);

      // Combine context
      const before = wordsBefore.slice(-10).join(" ");
      const after = wordsAfter.slice(0, 10).join(" ");
      context = `${before ? before + " " : ""}${characterHTML}${characterSlugMissingPunctuation}${after ? " " + after : ""}`;

      // Remove space before punctuation marks
      context = context.replace(/\s+([.,;:!?])/g, "$1");

      if (context.trim()) {
        results.push({ html: context.trim(), offset: getTextOffset(tempDiv, characterElement) });
      }
    }
  });

  // Filter out very close hits (near-overlapping). Use a small character-distance threshold.
  const MIN_CHAR_GAP = 60; // roughly "a few words" apart
  const sortedByOffset = [...results].sort((a, b) => a.offset - b.offset);
  const filteredByProximity: { html: string; offset: number }[] = [];
  for (const entry of sortedByOffset) {
    const last = filteredByProximity[filteredByProximity.length - 1];
    if (!last || entry.offset - last.offset >= MIN_CHAR_GAP) {
      filteredByProximity.push(entry);
    }
  }

  // Ensure uniqueness by HTML and join
  const seenHtml = new Set<string>();
  const uniqueHtmls: string[] = [];
  for (const entry of filteredByProximity) {
    if (!seenHtml.has(entry.html)) {
      seenHtml.add(entry.html);
      uniqueHtmls.push(entry.html);
    }
  }

  const finalResult = uniqueHtmls.join(" ");

  return finalResult;
};

export function findCharacterSentences(characterSlug: string, currentLocation: Location) {
  const characterData = getCharactersData().find((character) => character.slug === characterSlug);

  // Changed return type
  const items: SearchResultItemData[] = [];
  let resultIndex: number = 0;

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
        const totalParagraphsInChapter = getTotalParagraphsInChapter(chapter);

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
              percentInChapter: calculatePercentInChapter(paragraph, totalParagraphsInChapter),
              summary: highlightMatchedWords(summaryText, characterSlug),
              text: highlightMatchedWords(displayText, characterSlug),
              id: `local-dom-search-${chapter}-${paragraph}-${resultIndex++}`,
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
