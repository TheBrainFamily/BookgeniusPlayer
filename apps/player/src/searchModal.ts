import { searchParagraphsFromServer } from "./utils/searchParagraphsFromServer";
import type { Location } from "@player/state/LocationContext";
import { getCharactersData, getBookData } from "@player/state/bookDataStore";
import { useBookContentStore } from "./stores/bookContent.store";
import { bookIndex } from "@player/logic/BookIndex";
import type { InfoPerChapter } from "@player/fetchers/getParagraphRange";

export interface SearchResultItemData {
  score?: number;
  chapter: number;
  paragraphNumber: number;
  percentInChapter: number;
  summary: string;
  text?: string;
  id: string; // For React keys
  type?: SearchType;
}

enum SearchType {
  MENTIONED = "Mentioned",
  TALKING = "Talking",
}

export interface SearchResultsData {
  header: string;
  items: SearchResultItemData[];
  areEmbeddings?: boolean;
  isLoading?: boolean;
  isRefreshing?: boolean;
  isCharacterResults?: boolean;
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
  return text.replace(pattern, `<mark class="${CHARACTER_HIGHLIGHT_CLASS}">$&</mark>`);
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

    const items: SearchResultItemData[] = serverMatches
      .map((match, index) => {
        const totalParagraphsInChapter = getTotalParagraphsInChapter(match.chapter);
        const paragraphText = match.summary
          ? findTextByParagraphAndChapter(match.chapter, match.paragraphNumber)
          : match.text;
        const contextualText = createContextualSummary(paragraphText || match.text, query);
        return {
          chapter: match.chapter,
          paragraphNumber: match.paragraphNumber,
          percentInChapter: calculatePercentInChapter(
            match.paragraphNumber,
            totalParagraphsInChapter,
          ),
          summary: match.summary
            ? contextualText
            : createContextualSummary(
                findTextByParagraphAndChapter(match.chapter, match.paragraphNumber),
                query,
              ),
          text: match.summary ? match.summary : contextualText,
          id: `search-result-${match.chapter}-${match.paragraphNumber}-${index}`,
          score: match.score,
        };
      })
      .sort((a, b) => b.score - a.score);

    return { header, items, areEmbeddings: true, isLoading: false };
  } catch (error) {
    console.error("Search error in performUnifiedSearch:", error);
    return { header: "Search failed. Please try again.", items: [], isLoading: false };
  }
}

/**
 * Creates a summary that starts 20 characters before the found text with highlighting
 */
const createContextualSummary = (
  fullText: string,
  query: string,
  maxLength: number = 150,
): string => {
  const queryLower = query.toLowerCase();
  const fullTextLower = fullText.toLowerCase();

  const matchIndex = fullTextLower.indexOf(queryLower);
  if (matchIndex === -1) {
    // Fallback to original behavior if query not found, but still apply highlighting
    const truncated =
      fullText.length > maxLength ? `${fullText.substring(0, maxLength)}...` : fullText;
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

// eslint-disable-next-line complexity
export function performCachedSearch(query: string, currentLocation: Location): SearchResultsData {
  const { textCache, isInitialized } = useBookContentStore.getState();
  const bookIsPlay =
    getBookData().metadata.bookForm === "play" || getBookData().metadata.bookForm === "mixed";
  let bookCharacters: string[] = [];
  if (bookIsPlay) {
    bookCharacters = getCharactersData().map((character) => character.characterName.toLowerCase());
  }

  const items: SearchResultItemData[] = [];
  const queryLower = query.toLowerCase();

  if (!query.trim()) {
    return { header: "Please enter a search term.", items: [], isLoading: false };
  }

  if (!isInitialized) {
    return {
      header: "Book content is being indexed, please try again shortly.",
      items: [],
      isLoading: true,
    };
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
          // DOM-based detection: if this paragraph is a character-name line, append the next spoken line
          try {
            const paragraphElement = bookIndex.getParagraphElement(chapterIdNum, paragraphNumber);
            const isCharacterLine = paragraphElement?.getAttribute("data-is-character") === "true";

            // eslint-disable-next-line max-depth -- play format character line detection
            if (isCharacterLine) {
              const nextParagraphElement = bookIndex.getParagraphElement(
                chapterIdNum,
                paragraphNumber + 1,
              );
              const nextIsSpoken =
                nextParagraphElement?.getAttribute("data-is-character") === "false";

              // eslint-disable-next-line max-depth -- play format character line detection
              if (nextParagraphElement && nextIsSpoken) {
                const rawName = (paragraphElement!.textContent || "").replace(/\s+/g, " ").trim();
                const prettyName = rawName.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
                const nextText = (nextParagraphElement.textContent || "")
                  .replace(/[\n\r]/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();

                // eslint-disable-next-line max-depth -- play format character line detection
                if (nextText) {
                  paragraphText = `${prettyName}: ${nextText}`;
                }
              }
            } else {
              // Fallback to previous string-based detection if DOM attributes aren't usable
              // eslint-disable-next-line max-depth -- play format fallback detection
              if (bookCharacters.includes(paragraphText.trim().toLowerCase())) {
                const nextParagraphText = chapterCache[paragraphNumber + 1];
                // eslint-disable-next-line max-depth -- play format fallback detection
                if (nextParagraphText) {
                  paragraphText = `${paragraphText}: ${nextParagraphText}`;
                }
              }
            }
          } catch {
            // If anything goes wrong with DOM access, keep previous behavior silently
          }
        }

        items.push({
          chapter: chapterIdNum,
          paragraphNumber,
          percentInChapter: calculatePercentInChapter(paragraphNumber, totalParagraphsInChapter),
          summary: createContextualSummary(paragraphText, query),
          id: `cached-search-${chapterIdNum}-${paragraphNumber}`,
        });
      }
    }
  }

  const totalMatches = items.length;
  const header =
    totalMatches > 0
      ? `Found ${totalMatches} match(es) in read text for "${query}"`
      : `No matches found in read text for "${query}"`;

  return {
    header,
    items: items.sort((a, b) => a.chapter - b.chapter || a.paragraphNumber - b.paragraphNumber),
    isLoading: false,
  };
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
      const cached = cache.get(chapterNumber)!;
      if (cached > 0) {
        return cached;
      }
    }

    try {
      bookIndex.ensureInitialized();
      const count = bookIndex.getParagraphCount(chapterNumber);
      if (count <= 0) {
        console.log("[SearchPercent] missing paragraph count", { chapterNumber, count });
      }
      if (count > 0) {
        cache.set(chapterNumber, count);
      }
      return count;
    } catch (error) {
      console.error(`Error getting paragraph count for chapter ${chapterNumber}:`, error);
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

const SUMMARY_TRUNCATE_LENGTH = 210;
const CHARACTER_HIGHLIGHT_CLASS =
  "bg-book-secondary-20 text-white font-semibold rounded-sm shadow-sm";

const findTextByParagraphAndChapter = (chapter: number, paragraphNumber: number): string => {
  try {
    bookIndex.ensureInitialized();
    const paragraphElement = bookIndex.getParagraphElement(chapter, paragraphNumber);
    if (!paragraphElement) {
      return "";
    }

    const textContent = paragraphElement.textContent ?? "";
    return textContent
      .replace(/[\n\r]+/g, " ") // Replace newlines and carriage returns with spaces
      .replace(/\s+/g, " ") // Replace multiple spaces with a single space
      .trim();
  } catch (error) {
    console.error(
      `Error retrieving text for chapter ${chapter}, paragraph ${paragraphNumber}:`,
      error,
    );
    return "";
  }
};

interface FindCharacterSentencesOptions {
  mode?: "chronological" | "spotlight";
  limit?: number;
}

export function findCharacterSentences(
  characterSlug: string,
  currentLocation: Location,
  options: FindCharacterSentencesOptions = {},
) {
  const isPlay =
    getBookData().metadata.bookForm === "play" || getBookData().metadata.bookForm === "mixed";
  const characterData = getCharactersData().find((character) => character.slug === characterSlug);

  const spottedCharacterItems: SearchResultItemData[] = [];
  const talkingCharacterItems: SearchResultItemData[] = [];
  let resultIndex: number = 0;

  try {
    if (characterData) {
      const spottedCharacterHistory: { chapter: number; paragraphs: number[] }[] = [];
      const talkingCharacterHistory: { chapter: number; paragraphs: number[] }[] = [];
      const historyTillCurrentChapter = characterData.infoPerChapter.filter(
        (characterInfo) => characterInfo.chapter <= currentLocation.chapter,
      );

      if (historyTillCurrentChapter.length > 0) {
        historyTillCurrentChapter.forEach((infoPerChapter: InfoPerChapter) => {
          if (infoPerChapter.chapter < currentLocation.chapter) {
            if (infoPerChapter.paragraphsWhereSpotted.length > 0) {
              spottedCharacterHistory.push({
                chapter: infoPerChapter.chapter,
                paragraphs: infoPerChapter.paragraphsWhereSpotted,
              });
            }
            if (infoPerChapter.paragraphsWhereTalking.length > 0) {
              talkingCharacterHistory.push({
                chapter: infoPerChapter.chapter,
                paragraphs: infoPerChapter.paragraphsWhereTalking,
              });
            }
          } else {
            const spottedHistoryTillCurrentParagraph = infoPerChapter.paragraphsWhereSpotted.filter(
              (paragraph) => paragraph <= currentLocation.paragraph,
            );
            if (spottedHistoryTillCurrentParagraph.length > 0) {
              spottedCharacterHistory.push({
                chapter: infoPerChapter.chapter,
                paragraphs: spottedHistoryTillCurrentParagraph,
              });
            }
            const talkingHistoryTillCurrentParagraph = infoPerChapter.paragraphsWhereTalking.filter(
              (paragraph) => paragraph <= currentLocation.paragraph,
            );
            if (talkingHistoryTillCurrentParagraph.length > 0) {
              talkingCharacterHistory.push({
                chapter: infoPerChapter.chapter,
                paragraphs: talkingHistoryTillCurrentParagraph,
              });
            }
          }
        });
      }

      spottedCharacterHistory.forEach(({ chapter, paragraphs }) => {
        const totalParagraphsInChapter = getTotalParagraphsInChapter(chapter);

        // eslint-disable-next-line complexity
        paragraphs.forEach((paragraph) => {
          const paragraphElement = bookIndex.getParagraphElement(chapter, paragraph);
          if (!paragraphElement) return;

          const tagName = paragraphElement.tagName.toLowerCase();
          const isStageDirectory = paragraphElement.getAttribute("data-is-didaskalia") === "true";

          if (tagName === "h3" || tagName === "h4" || tagName === "h5" || isStageDirectory) return;

          const playRow = paragraphElement.closest(".play-row");

          if (isPlay && playRow) {
            const characterText = playRow.querySelector(".character-text");

            if (characterText) {
              const characterTextElement = characterText as HTMLElement;

              const findNextSpokenParagraph = (start: Element | null): HTMLElement | null => {
                if (!start) return null;
                let next = start.nextElementSibling as HTMLElement | null;

                while (next) {
                  if (
                    next.tagName.toLowerCase() === "p" &&
                    next.getAttribute("data-is-character") !== "true"
                  ) {
                    return next;
                  }
                  next = next.nextElementSibling as HTMLElement | null;
                }

                return null;
              };

              const characterTalking = (characterTextElement.querySelector(
                'p[data-is-character="true"]',
              ) ?? characterTextElement.firstElementChild) as HTMLElement | null;
              const characterTalkingIndexAttr = characterTalking?.getAttribute("data-index");
              const characterTalkingIndex = characterTalkingIndexAttr
                ? Number(characterTalkingIndexAttr)
                : NaN;

              let firstParagraph = Number.isFinite(characterTalkingIndex)
                ? (characterTextElement.querySelector(
                    `p[data-index="${characterTalkingIndex + 1}"]`,
                  ) as HTMLElement | null)
                : null;

              if (!firstParagraph) {
                firstParagraph = findNextSpokenParagraph(characterTalking);
              }

              const paragraphInnerHTML = paragraphElement.innerHTML;
              const sentence = filterParagraphByCharacter(paragraphInnerHTML, characterSlug);

              if (sentence) {
                const removedHtmlTags = stripHtmlTags(sentence);

                let _sentence: string;

                if (removedHtmlTags.length > SUMMARY_TRUNCATE_LENGTH) {
                  const excerpt = extractTextAroundMark(sentence);
                  _sentence =
                    excerpt ?? `${removedHtmlTags.substring(0, SUMMARY_TRUNCATE_LENGTH)}...`;
                } else {
                  _sentence = sentence;
                }

                const currentParagraphInRow =
                  (characterTextElement.querySelector(
                    `p[data-index="${paragraph}"]`,
                  ) as HTMLElement | null) || (paragraphElement as HTMLElement);
                const currentIndexAttr = currentParagraphInRow?.getAttribute("data-index");
                const currentIndex = currentIndexAttr ? Number(currentIndexAttr) : paragraph;

                let nextElement = characterTextElement.querySelector(
                  `p[data-index="${currentIndex + 1}"]`,
                ) as HTMLElement | null;

                if (!nextElement || nextElement.getAttribute("data-is-character") === "true") {
                  nextElement = findNextSpokenParagraph(currentParagraphInRow);
                }

                const speakerName = characterTalking?.textContent?.trim();
                const firstSpeechText = firstParagraph?.textContent?.trim();
                const lineEntries: {
                  text: string;
                  type: "speaker" | "current" | "next" | "extra";
                }[] = [];
                let currentMergedIntoSpeaker = false;

                if (speakerName && firstSpeechText) {
                  lineEntries.push({
                    text: `${speakerName.toUpperCase()}: ${firstSpeechText}`,
                    type: "speaker",
                  });
                }

                const trimmedSentence = _sentence.trim();
                if (trimmedSentence) {
                  const hasGap =
                    lineEntries.length > 0 &&
                    Number.isFinite(characterTalkingIndex) &&
                    Number.isFinite(currentIndex) &&
                    currentIndex - (characterTalkingIndex + 1) > 1;
                  const needsEllipsis = hasGap && !trimmedSentence.startsWith("...");
                  const currentLineText = `${needsEllipsis ? "..." : ""}${trimmedSentence}`;

                  const currentComparable = normalizeForComparison(currentLineText);
                  const speakerEntry = lineEntries.find((entry) => entry.type === "speaker");
                  const speakerComparable = speakerEntry
                    ? normalizeForComparison(extractSpeechContentFromLine(speakerEntry.text))
                    : "";

                  if (
                    speakerEntry &&
                    currentComparable &&
                    currentComparable === speakerComparable
                  ) {
                    const speakerPrefix = speakerEntry.text.split(":")[0];
                    speakerEntry.text = speakerPrefix
                      ? `${speakerPrefix}: ${currentLineText}`
                      : currentLineText;
                    currentMergedIntoSpeaker = true;
                  } else if (currentComparable) {
                    lineEntries.push({ text: currentLineText, type: "current" });
                  }
                }

                if (nextElement && nextElement.textContent?.trim()) {
                  const nextText = nextElement.textContent.trim();
                  const nextComparable = normalizeForComparison(nextText);
                  const alreadyPresent = lineEntries.some((entry) => {
                    const entryComparable =
                      entry.type === "speaker"
                        ? normalizeForComparison(extractSpeechContentFromLine(entry.text))
                        : normalizeForComparison(entry.text);
                    return entryComparable === nextComparable;
                  });

                  if (!alreadyPresent && nextComparable) {
                    lineEntries.push({ text: nextText, type: "next" });
                  }
                }

                if (currentMergedIntoSpeaker && nextElement && lineEntries.length < 3) {
                  const afterNextElement = findNextSpokenParagraph(nextElement);
                  if (afterNextElement && afterNextElement.textContent?.trim()) {
                    const afterNextText = afterNextElement.textContent.trim();
                    const afterNextComparable = normalizeForComparison(afterNextText);
                    const alreadyPresent = lineEntries.some((entry) => {
                      const entryComparable =
                        entry.type === "speaker"
                          ? normalizeForComparison(extractSpeechContentFromLine(entry.text))
                          : normalizeForComparison(entry.text);
                      return entryComparable === afterNextComparable;
                    });

                    if (!alreadyPresent && afterNextComparable) {
                      lineEntries.push({ text: afterNextText, type: "extra" });
                    }
                  }
                }

                if (lineEntries.length > 0) {
                  const result = lineEntries.map((entry) => entry.text).join("\n");
                  const formattedResult = formatWithHangingIndent(result.trim());

                  spottedCharacterItems.push({
                    chapter,
                    paragraphNumber: paragraph,
                    percentInChapter: calculatePercentInChapter(
                      paragraph,
                      totalParagraphsInChapter,
                    ),
                    summary: formattedResult,
                    id: `local-dom-search-${chapter}-${paragraph}-${resultIndex++}`,
                    type: SearchType.MENTIONED,
                  });
                }
              }
            }
          } else {
            const paragraphInnerHTML = paragraphElement.innerHTML;

            const sentence = filterParagraphByCharacter(paragraphInnerHTML, characterSlug);

            if (sentence) {
              const removedHtmlTags = stripHtmlTags(sentence);

              let _sentence: string;

              if (removedHtmlTags.length > SUMMARY_TRUNCATE_LENGTH) {
                const excerpt = extractTextAroundMark(sentence);
                _sentence =
                  excerpt ?? `${removedHtmlTags.substring(0, SUMMARY_TRUNCATE_LENGTH)}...`;
              } else {
                _sentence = sentence;
              }

              spottedCharacterItems.push({
                chapter,
                paragraphNumber: paragraph,
                percentInChapter: calculatePercentInChapter(paragraph, totalParagraphsInChapter),
                summary: _sentence,
                id: `local-dom-search-${chapter}-${paragraph}-${resultIndex++}`,
                type: SearchType.MENTIONED,
              });
            }
          }
        });
      });

      talkingCharacterHistory.forEach(({ chapter, paragraphs }) => {
        const totalParagraphsInChapter = getTotalParagraphsInChapter(chapter);

        paragraphs.forEach((paragraph) => {
          const paragraphElement = bookIndex.getParagraphElement(chapter, paragraph);
          if (!paragraphElement) return;

          const playRow = paragraphElement.closest(".play-row");

          if (isPlay && playRow) {
            const characterDialogue = convertCharacterDialogue(playRow);
            talkingCharacterItems.push({
              chapter,
              paragraphNumber: paragraph,
              percentInChapter: calculatePercentInChapter(paragraph, totalParagraphsInChapter),
              summary: formatWithHangingIndent(characterDialogue),
              id: `local-dom-search-${chapter}-${paragraph}-${resultIndex++}`,
              type: SearchType.TALKING,
            });
          } else {
            const tagName = paragraphElement.tagName.toLowerCase();
            const isStageDirectory = paragraphElement.getAttribute("data-is-didaskalia") === "true";

            if (tagName === "h3" || tagName === "h4" || tagName === "h5" || isStageDirectory)
              return;

            const paragraphInnerHTML = paragraphElement.innerHTML;

            const sentence = filterParagraphByCharacter(paragraphInnerHTML, characterSlug);

            if (sentence) {
              const removedHtmlTags = stripHtmlTags(sentence);

              let _sentence: string;

              if (removedHtmlTags.length > SUMMARY_TRUNCATE_LENGTH) {
                const excerpt = extractTextAroundMark(sentence);
                _sentence =
                  excerpt ?? `${removedHtmlTags.substring(0, SUMMARY_TRUNCATE_LENGTH)}...`;
              } else {
                _sentence = sentence;
              }

              talkingCharacterItems.push({
                chapter,
                paragraphNumber: paragraph,
                percentInChapter: calculatePercentInChapter(paragraph, totalParagraphsInChapter),
                summary: _sentence,
                id: `local-dom-search-${chapter}-${paragraph}-${resultIndex++}`,
                type: SearchType.TALKING,
              });
            }
          }
        });
      });
    }
  } catch (error) {
    console.error("Error in performLocalDOMSearch:", error);
    // Return SearchResultsData structure on error
    return {
      header: `Error performing local search for "${characterSlug}".`,
      items: [],
      isLoading: false,
    };
  }

  const chronologicalItems = sortSearchResults(spottedCharacterItems, talkingCharacterItems);
  const { mode = "chronological", limit } = options;

  const spotlightLimit = typeof limit === "number" && limit > 0 ? limit : 3;
  const items =
    mode === "spotlight"
      ? buildSpotlightItems(
          spottedCharacterItems,
          talkingCharacterItems,
          chronologicalItems,
          spotlightLimit,
        )
      : typeof limit === "number" && limit > 0
        ? chronologicalItems.slice(0, limit)
        : chronologicalItems;

  // Construct SearchResultsData object for successful search
  const totalMatches = mode === "spotlight" ? chronologicalItems.length : items.length;
  let header = "";
  if (totalMatches > 0) {
    header = `Found ${totalMatches} local match(es) for "${characterSlug}" (context: Ch. ${currentLocation.chapter}, P. ${currentLocation.paragraph})`;
  } else {
    header = `No local matches found for "${characterSlug}" (context: Ch. ${currentLocation.chapter}, P. ${currentLocation.paragraph})`;
  }

  return { header, items, isLoading: false, isCharacterResults: true };
}

function stripHtmlTags(str: string) {
  if (!str) {
    return "";
  }

  // Remove HTML tags using regex
  return str.replace(/<[^>]*>/g, "");
}

function normalizeForComparison(text: string): string {
  if (!text) return "";
  return stripHtmlTags(text).replace(/\s+/g, " ").trim().toLowerCase();
}

function extractSpeechContentFromLine(line: string): string {
  if (!line) return "";
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) {
    return line;
  }
  return line.slice(colonIndex + 1);
}

function filterParagraphByCharacter(paragraph: string, characterSlug: string): string {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = paragraph;

  const elementsWithCharacter = tempDiv.querySelectorAll("[data-character]");

  elementsWithCharacter.forEach((element) => {
    if (element.getAttribute("data-character") !== characterSlug) {
      const textContent = element.textContent;
      element.replaceWith(document.createTextNode(textContent));
    } else {
      const markElement = document.createElement("mark");
      markElement.className = CHARACTER_HIGHLIGHT_CLASS;
      markElement.textContent = element.textContent;
      element.replaceWith(markElement);
    }
  });

  let result = tempDiv.innerHTML;

  const markPlaceholder = "___TEMP_MARK___";
  const markTags = result.match(/<mark[^>]*>.*?<\/mark>/g) || [];
  markTags.forEach((tag, index) => {
    result = result.replace(tag, `${markPlaceholder}${index}${markPlaceholder}`);
  });

  result = result.replace(/<[^>]*>/g, "");

  markTags.forEach((tag, index) => {
    result = result.replace(`${markPlaceholder}${index}${markPlaceholder}`, tag);
  });

  result = result.replace(/&nbsp;/g, " ");
  result = result.replace(/\s+/g, " ");
  result = result.trim();

  return result;
}

function extractTextAroundMark(paragraph: string): string | null {
  const markCloseTag = "</mark>";
  if (!paragraph.includes(markCloseTag)) {
    return null;
  }

  const markStart = paragraph.indexOf("<mark");
  if (markStart === -1) {
    return null;
  }

  const markOpenEnd = paragraph.indexOf(">", markStart) + 1;
  const markCloseStart = paragraph.indexOf(markCloseTag);
  const markEnd = markCloseStart + markCloseTag.length;

  const markedText = paragraph.substring(markOpenEnd, markCloseStart);

  const targetTextLength = SUMMARY_TRUNCATE_LENGTH;

  const beforeChars = Math.floor((targetTextLength - markedText.length) / 2);
  const afterChars = targetTextLength - markedText.length - beforeChars;

  let startPos = Math.max(0, markStart - beforeChars);

  let endPos = Math.min(paragraph.length, markEnd + afterChars);

  const currentTextLength = markStart - startPos + markedText.length + (endPos - markEnd);
  if (currentTextLength < targetTextLength) {
    const extraChars = targetTextLength - currentTextLength;

    const canExtendBack = startPos;
    const extendBack = Math.min(canExtendBack, extraChars);
    startPos -= extendBack;

    const remaining = extraChars - extendBack;
    const canExtendForward = paragraph.length - endPos;
    const extendForward = Math.min(canExtendForward, remaining);
    endPos += extendForward;
  }

  let result = paragraph.substring(startPos, endPos);

  if (startPos > 0) {
    const firstSpaceIndex = result.indexOf(" ");
    if (firstSpaceIndex !== -1) {
      result = result.substring(firstSpaceIndex + 1);
    }
    result = "..." + result;
  }

  const lastOpenBracket = result.lastIndexOf("<");
  if (lastOpenBracket !== -1) {
    const lastCloseBracket = result.lastIndexOf(">");
    if (lastOpenBracket > lastCloseBracket) {
      result = result.substring(0, lastOpenBracket);
    }
  }

  if (!/[^.][.]$|^[.]$|[!?]+$/.test(result)) {
    if (!result.endsWith("...")) {
      result = result.trim() + "...";
    }
  }

  return result;
}

function convertCharacterDialogue(playRow: Element): string {
  if (!(playRow instanceof HTMLElement)) {
    return "";
  }

  const characterText = playRow.querySelector(".character-text") as HTMLElement | null;
  if (!characterText || !characterText.firstElementChild) {
    return (playRow.textContent || "").trim();
  }

  const characterNode = characterText.firstElementChild as HTMLElement;
  const characterName = (characterNode.textContent || "").trim();

  const dialogueLines = Array.from(characterText.children)
    .slice(1)
    .map((element) => (element.textContent || "").trim())
    .filter((line) => line.length > 0);

  const speakerLabel = characterName ? characterName.toUpperCase() : "";

  if (!speakerLabel && dialogueLines.length === 0) {
    return "";
  }

  if (!speakerLabel) {
    return dialogueLines.join("\n");
  }

  const firstLine = dialogueLines[0] ?? "";
  const additionalLines = dialogueLines.slice(1);

  const rawBlock = firstLine
    ? [`${speakerLabel}: ${firstLine}`, ...additionalLines].join("\n")
    : `${speakerLabel}:`;

  const formatted = formatWithHangingIndent(rawBlock);
  const highlightedLabel = `<mark class="${CHARACTER_HIGHLIGHT_CLASS}">${speakerLabel}</mark>`;

  return formatted.replace(`${speakerLabel}:`, `${highlightedLabel}:`);
}

const compareSearchItems = (a: SearchResultItemData, b: SearchResultItemData): number => {
  if (a.chapter !== b.chapter) {
    return a.chapter - b.chapter;
  }

  return a.paragraphNumber - b.paragraphNumber;
};

function sortSearchResults(
  array1: SearchResultItemData[],
  array2: SearchResultItemData[],
): SearchResultItemData[] {
  // Concatenate the arrays
  const combined = [...array1, ...array2];

  // Sort by chapter first, then by paragraph number
  return combined.sort(compareSearchItems);
}

function getEarliestItem(items: SearchResultItemData[]): SearchResultItemData | undefined {
  if (items.length === 0) return undefined;
  return [...items].sort(compareSearchItems)[0];
}

function buildSpotlightItems(
  spottedItems: SearchResultItemData[],
  talkingItems: SearchResultItemData[],
  chronologicalItems: SearchResultItemData[],
  limit: number,
): SearchResultItemData[] {
  if (limit <= 0) return [];

  const earliestSpotted = getEarliestItem(spottedItems);
  const earliestTalking = getEarliestItem(talkingItems);

  const results: SearchResultItemData[] = [];
  const usedIds = new Set<string>();

  const addItem = (item: SearchResultItemData | undefined) => {
    if (!item) return;
    if (usedIds.has(item.id)) return;
    results.push(item);
    usedIds.add(item.id);
  };

  let firstType: "spotted" | "talking" | null = null;
  if (!earliestSpotted && earliestTalking) {
    addItem(earliestTalking);
    firstType = "talking";
  } else if (!earliestTalking && earliestSpotted) {
    addItem(earliestSpotted);
    firstType = "spotted";
  } else if (earliestSpotted && earliestTalking) {
    if (compareSearchItems(earliestSpotted, earliestTalking) <= 0) {
      addItem(earliestSpotted);
      firstType = "spotted";
    } else {
      addItem(earliestTalking);
      firstType = "talking";
    }
  }

  if (results.length >= limit) return results;

  if (firstType === "spotted") {
    addItem(earliestTalking);
  } else if (firstType === "talking") {
    addItem(earliestSpotted);
  }

  if (results.length >= limit) return results.slice(0, limit);

  const remainingChronological = chronologicalItems.filter((item) => !usedIds.has(item.id));
  if (remainingChronological.length > 0) {
    const middleStart = Math.floor(remainingChronological.length / 3);
    const middleEnd = Math.max(middleStart + 1, Math.ceil((remainingChronological.length * 2) / 3));
    const middleCandidates = remainingChronological.slice(middleStart, middleEnd);
    const randomPool = middleCandidates.length > 0 ? middleCandidates : remainingChronological;
    const randomItem = randomPool[Math.floor(Math.random() * randomPool.length)];
    addItem(randomItem);
  }

  if (results.length >= limit) return results.slice(0, limit);

  for (const item of chronologicalItems) {
    if (results.length >= limit) break;
    addItem(item);
  }

  return results.slice(0, limit);
}

function formatWithHangingIndent(text: string) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) return "";

  const firstLine = lines[0];
  const speakerMatch = firstLine.match(/^([A-Z]+):\s*(.*)$/);

  if (!speakerMatch) return text; // Return original if no speaker format found

  const speaker = speakerMatch[1];
  const firstDialogue = speakerMatch[2];
  const indent = " ".repeat(speaker.length + 2); // Speaker name + ": "

  const formattedLines = [`${speaker}: ${firstDialogue}`];

  // Add remaining lines with proper indentation
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      formattedLines.push(indent + line);
    }
  }

  return formattedLines.join("\n");
}
