import { pharaonCharactersData } from "../data/pharaon-apr-10.selfsufficientcharactermetadatas";
import { BOOK_SLUGS } from "../consts";

/**
 * Interface for the parameters required by the getParagraphRange function.
 */
export interface GetParagraphRangeParams {
  bookSlug: BOOK_SLUGS;
  startChapter: number;
  startParagraph: number;
  endChapter: number;
  endParagraph: number;
}

/**
 * Fetches paragraph metadata for a given range within a specific book using query parameters.
 *
 * @param {GetParagraphRangeParams} params - The parameters for fetching the paragraph range.
 *   Includes bookSlug, startChapter, startParagraph, endChapter, and endParagraph.
 * @returns {Promise<IEntityNote[]>} A promise that resolves with the paragraph metadata.
 * @throws {Error} Throws an error if the network response is not ok or if fetching fails.
 */
export async function getParagraphRange({ bookSlug, startChapter, startParagraph, endChapter, endParagraph }: GetParagraphRangeParams): Promise<SelfSufficientCharacterMetadata[]> {
  // Construct the URL with the bookSlug as a route parameter and others as query parameters
  const queryParams = new URLSearchParams({
    startChapter: startChapter.toString(),
    startParagraph: startParagraph.toString(),
    endChapter: endChapter.toString(),
    endParagraph: endParagraph.toString(),
  });

  const apiUrl = `/api/paragraphs/${bookSlug}?${queryParams.toString()}`;

  console.log("API URL", apiUrl);
  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // Add any other necessary headers like Authorization if needed
      },
    });

    if (!response.ok) {
      // Attempt to parse error message from response body, otherwise use status text
      let errorBody = null;
      try {
        errorBody = await response.json();
      } catch {
        // Ignore if response body is not valid JSON
      }
      const errorMessage = errorBody?.message || errorBody?.error || response.statusText;
      throw new Error(`Network response was not ok: ${errorMessage} (status: ${response.status})`);
    }

    // Parse the JSON response
    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Error fetching paragraph range:", error);
    // Re-throw the error so the caller can handle it, potentially enriching it
    throw new Error(`Failed to fetch paragraph range: ${error.message}`);
  }
}

export type ParsedParagraphRange = {
  canonicalName: string;
  summary: string;
  imageUrl: string;
  paragraphNumber: number;
  chapterNumber: number;
  label?: string;
  otherAppearances: { chapterNumber: number; paragraphNumber: number }[];
};

export function parseParagraphRange(data: SelfSufficientCharacterMetadata[]): ParsedParagraphRange[] {
  // For each character, find their first appearance within the paragraphs listed in the input data.
  // Assumes 'data' is already filtered for the relevant paragraph range.
  return data.map((character) => {
    let firstAppearance: {
      chapterNumber: number;
      paragraphNumber: number;
      summary: string;
      label?: string;
      otherAppearances: { chapterNumber: number; paragraphNumber: number }[];
    } | null = null;

    // Sort chapters to ensure we check them in ascending order.
    const sortedChapters = [...character.infoPerChapter].sort((a, b) => a.chapter - b.chapter);

    for (const info of sortedChapters) {
      // Sort paragraphs within the chapter to find the earliest one.
      const sortedParagraphs = [...info.paragraphsWhereSpotted].sort((a, b) => a - b);

      if (sortedParagraphs.length > 0) {
        // Found the first paragraph appearance for this character.
        firstAppearance = {
          chapterNumber: info.chapter,
          paragraphNumber: sortedParagraphs[0] + 1,
          summary: info.summary, // Use summary from the chapter of first appearance
          label: info.label, // Use label from the chapter of first appearance
          otherAppearances: [
            ...sortedParagraphs.slice(1).map((paragraphNumber) => ({ chapterNumber: info.chapter, paragraphNumber: paragraphNumber + 1 })),
            ...sortedChapters
              .filter((chapter) => chapter.chapter !== info.chapter)
              .flatMap((chapter) => chapter.paragraphsWhereSpotted.map((paragraphNumber) => ({ chapterNumber: chapter.chapter, paragraphNumber: paragraphNumber + 1 }))),
          ],
        };
      }
    }

    // If a character in the input data has no listed paragraphs (which shouldn't happen if pre-filtered correctly).
    if (!firstAppearance) {
      // Log a warning or throw an error, as this indicates unexpected input data.
      console.warn(`Character ${character.characterName} (book: ${character.bookSlug}) provided to parseParagraphRange has no paragraphs listed.`);
      // Depending on desired behavior, you might want to throw an error or return a default object.
      // For now, let's throw an error to make the issue explicit.
      throw new Error(`Character ${character.characterName} has no paragraphs listed in the provided data.`);
      // If you prefer to filter out such characters instead: return null; and add .filter(Boolean) after .map()
    }

    // Construct the result object for this character.
    return {
      canonicalName: character.characterName,
      imageUrl: character.imageUrl,
      summary: firstAppearance.summary,
      paragraphNumber: firstAppearance.paragraphNumber,
      chapterNumber: firstAppearance.chapterNumber,
      label: firstAppearance.label,
      otherAppearances: firstAppearance.otherAppearances,
    };
  });
  // If returning null for characters without paragraphs, uncomment the filter below:
  // .filter((item): item is ParsedParagraphRange => item !== null);
}

export type SelfSufficientCharacterMetadata = {
  characterName: string;
  bookSlug: BOOK_SLUGS;
  infoPerChapter: { chapter: number; summary: string; label?: string; paragraphsWhereSpotted: number[] }[];
  imageUrl: string;
};

export function getParagraphRangePure({ bookSlug, startChapter, startParagraph, endChapter, endParagraph }: GetParagraphRangeParams): SelfSufficientCharacterMetadata[] {
  // Filter characters by bookSlug first
  const charactersByBook = pharaonCharactersData.filter((character) => character.bookSlug === bookSlug) as SelfSufficientCharacterMetadata[]; // Assert type here

  // Now filter based on the paragraph range logic
  const filteredCharacters = charactersByBook.filter((character) => {
    return character.infoPerChapter.some((info) => {
      // Check if the chapter itself is within the broader chapter range if it's a multi-chapter search
      // This avoids unnecessary iteration over paragraphs if the chapter is outside the [startChapter, endChapter] range.
      if (info.chapter < startChapter || info.chapter > endChapter) {
        return false;
      }

      return info.paragraphsWhereSpotted.some((paragraphNumber) => {
        // Case 4: Single-chapter range
        if (startChapter === endChapter) {
          return info.chapter === startChapter && paragraphNumber >= startParagraph && paragraphNumber <= endParagraph;
        }
        // Multi-chapter range cases:
        // Case 1: Paragraphs in the start chapter, at or after startParagraph
        if (info.chapter === startChapter && paragraphNumber >= startParagraph) {
          return true;
        }
        // Case 2: Paragraphs in chapters strictly between start and end chapters
        if (info.chapter > startChapter && info.chapter < endChapter) {
          return true;
        }
        // Case 3: Paragraphs in the end chapter, at or before endParagraph
        if (info.chapter === endChapter && paragraphNumber <= endParagraph) {
          return true;
        }
        return false; // Default case if none of the conditions match
      });
    });
  });

  return filteredCharacters;
}
