import { Location } from "@/state/LocationContext";
import { QUESTIONS_SERVER_URL } from "@/lib/consts";

const extractSummary = (text: string): string => {
  const summaryMatch = text.match(/<Summary>(.*?)<\/Summary>/);
  return summaryMatch ? summaryMatch[1].trim() : "";
};

const extractText = (text: string): string => {
  const textMatch = text.match(/<Text>(.*?)<\/Text>/);
  // If no <Text> tag, assume the whole input is the text, after removing potential <Summary> tag
  if (textMatch) {
    return textMatch[1].trim();
  } else {
    return text.replace(/<Summary>.*?<\/Summary>/, "").trim();
  }
};

export const parseSearchParagraphsServerResponse = (response: SearchParagraphsServerResponse[]): SearchParagraphsFunctionResponse[] => {
  return response.map((r) => {
    const summary = extractSummary(r.text);
    const text = extractText(r.text);
    return { chapter: r.chapter, paragraphNumber: r.paragraphNumber, text: text, summary: summary };
  });
};
export type SearchParagraphsServerResponse = { chapter: number; paragraphNumber: number; text: string };
export type SearchParagraphsFunctionResponse = { chapter: number; paragraphNumber: number; text: string; summary: string };

/**
 * Fetches search results from the backend server.
 * @param searchQuery The search term.
 * @param location The current location (chapter and paragraph) to determine the search range.
 * @returns A promise that resolves with the search results from the server.
 */
export async function searchParagraphsFromServer(searchQuery: string, location: Location): Promise<SearchParagraphsFunctionResponse[]> {
  const baseUrl = `${QUESTIONS_SERVER_URL}/getParagraphsForSearch`;
  const filter = {
    chapterFrom: 0, // Assuming 0-based chapter indexing
    chapterTo: location.endChapter,
    paragraphTo: location.endParagraph,
  };

  const params = new URLSearchParams({ searchQuery: searchQuery, filter: JSON.stringify(filter) });

  const url = `${baseUrl}?${params.toString()}`;
  console.log(`Fetching search results from: ${url}`); // Optional: for debugging

  try {
    const response = await fetch(url);
    if (!response.ok) {
      // Throw an error with status text for better debugging
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    const results = (await response.json()) as SearchParagraphsServerResponse[];
    console.log("Received results:", results); // Optional: for debugging
    // Parse the response before returning
    return parseSearchParagraphsServerResponse(results);
  } catch (error) {
    console.error("Error fetching search results from server:", error);
    // Depending on desired behavior, you might want to return an empty array,
    // display an error message to the user, or re-throw the error.
    return []; // Return empty array on error for now
  }
}
