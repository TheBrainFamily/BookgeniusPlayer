import { BOOK_SLUGS, IEntityNote } from "./PageMetadata";

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
export async function getParagraphRange({ bookSlug, startChapter, startParagraph, endChapter, endParagraph }: GetParagraphRangeParams): Promise<IEntityNote[]> {
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
