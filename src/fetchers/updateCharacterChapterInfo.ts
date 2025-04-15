import { BOOK_SLUGS } from "../consts";
import { SelfSufficientCharacterMetadata } from "./getParagraphRange";

/**
 * Updates the summary or label for a specific character within a specific chapter of a book.
 *
 * @param bookSlug - The slug identifier for the book.
 * @param characterName - The name of the character.
 * @param chapter - The chapter number.
 * @param updateData - An object containing the fields to update (summary and/or label).
 * @returns A promise that resolves with the updated character metadata, or rejects with an error.
 */
export const updateCharacterChapterInfo = async (
  bookSlug: BOOK_SLUGS,
  characterName: string,
  chapter: number,
  updateData: { summary?: string; label?: string },
): Promise<SelfSufficientCharacterMetadata> => {
  const apiUrl = `/api/paragraphs/${encodeURIComponent(bookSlug)}/${encodeURIComponent(characterName)}/${chapter}`;

  try {
    const response = await fetch(apiUrl, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updateData) });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Failed to parse error response" }));
      throw new Error(`API request failed with status ${response.status}: ${errorData?.error || response.statusText}`);
    }

    const updatedMetadata: SelfSufficientCharacterMetadata = await response.json();
    return updatedMetadata;
  } catch (error) {
    console.error("Error updating character chapter info:", error);
    // Re-throw the error so the caller can handle it
    throw error;
  }
};
