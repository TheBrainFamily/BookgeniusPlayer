import { getCurrentBookSlug } from "../getCurrentBookSlug";
import { IEnhancedPage } from "./PageMetadata";

/**
 * Fetches metadata for a specific page
 * @param pageNumber The page number to fetch metadata for
 * @returns The page data with metadata or null if an error occurs
 */
export async function getPageMetadata(pageNumber: number): Promise<IEnhancedPage | null> {
  try {
    const bookSlug = getCurrentBookSlug();
    const response = await fetch(`/api/pages/${pageNumber}/${bookSlug}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch metadata for page ${pageNumber}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching page metadata:", error);
    return null;
  }
}
