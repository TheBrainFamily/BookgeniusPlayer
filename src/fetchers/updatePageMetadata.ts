import { getCurrentBookSlug } from "../getCurrentBookSlug";
import { IPageMetadata } from "./PageMetadata";
export async function updatePageMetadata(pageNumber: number, pageMetadata: IPageMetadata) {
  try {
    const bookSlug = getCurrentBookSlug();
    const response = await fetch(`/api/pages/${pageNumber}/${bookSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageMetadata }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update metadata for page ${pageNumber}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error updating page metadata:", error);
    return null;
  }
}
