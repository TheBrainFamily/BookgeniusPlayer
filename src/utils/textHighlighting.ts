// Store original content for restoration
const originalContent = new Map<string, string>();

/**
 * Cleans up technical attributes that shouldn't be visible to users
 */
const cleanupTechnicalAttributes = (html: string): string => {
  // Remove technical audio/video attributes that are internal implementation details
  return html
    .replace(/\s+data-src-listening="[^"]*"/g, "")
    .replace(/\s+data-src-talking="[^"]*"/g, "")
    .replace(/\s+data-is-talking="[^"]*"/g, "");
};

/**
 * Highlights search query in a specific paragraph after navigation
 */
export const highlightSearchInParagraph = (chapter: number, paragraphNumber: number, searchQuery: string, delay: number = 200): void => {
  // Wait for scrolling to complete before highlighting
  setTimeout(() => {
    const paragraphSelector = `section[data-chapter="${chapter}"] [data-index="${paragraphNumber}"]`;
    const paragraphElement = document.querySelector(paragraphSelector) as HTMLElement;

    if (!paragraphElement) {
      console.warn(`Paragraph not found: ${paragraphSelector}`);
      return;
    }

    try {
      // First, clean up any existing highlights in this paragraph
      cleanupSearchHighlight(chapter, paragraphNumber);

      // Store the original HTML content
      const originalHTML = paragraphElement.innerHTML;
      const elementKey = `${chapter}-${paragraphNumber}`;
      originalContent.set(elementKey, originalHTML);

      // Clean up the HTML to remove technical attributes before highlighting
      const cleanHTML = cleanupTechnicalAttributes(originalHTML);

      // Create a case-insensitive search for the query
      const searchRegex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");

      // Replace the first occurrence with highlighted span
      const highlightedHTML = cleanHTML.replace(searchRegex, '<span class="search-highlight">$1</span>');

      // Only update if we found and replaced something
      if (highlightedHTML !== cleanHTML) {
        paragraphElement.innerHTML = highlightedHTML;

        // Remove highlight after a delay and restore original content
        setTimeout(() => {
          restoreOriginalContent(chapter, paragraphNumber);
        }, 5000); // Remove after 5 seconds
      }
    } catch (error) {
      console.error("Error highlighting search text:", error);
    }
  }, delay);
};

/**
 * Restores the original content of a paragraph, removing all highlights
 */
const restoreOriginalContent = (chapter: number, paragraphNumber: number): void => {
  const paragraphSelector = `section[data-chapter="${chapter}"] [data-index="${paragraphNumber}"]`;
  const paragraphElement = document.querySelector(paragraphSelector) as HTMLElement;
  const elementKey = `${chapter}-${paragraphNumber}`;

  if (!paragraphElement) {
    return;
  }

  try {
    // Get the original content from storage
    const originalHTML = originalContent.get(elementKey);

    if (originalHTML) {
      // Restore the exact original content
      paragraphElement.innerHTML = originalHTML;
      // Clean up the stored content
      originalContent.delete(elementKey);
    }
  } catch (error) {
    console.error("Error restoring original content:", error);
  }
};

/**
 * Cleans up search highlighting from a specific paragraph
 */
export const cleanupSearchHighlight = (chapter: number, paragraphNumber: number): void => {
  // Just restore the original content if available
  restoreOriginalContent(chapter, paragraphNumber);
};

/**
 * Cleans up all search highlights in the document
 */
export const cleanupAllSearchHighlights = (): void => {
  try {
    // Restore all stored original content
    for (const [elementKey, originalHTML] of originalContent.entries()) {
      const [chapter, paragraphNumber] = elementKey.split("-");
      const paragraphSelector = `section[data-chapter="${chapter}"] [data-index="${paragraphNumber}"]`;
      const paragraphElement = document.querySelector(paragraphSelector) as HTMLElement;

      if (paragraphElement) {
        paragraphElement.innerHTML = originalHTML;
      }
    }

    // Clear all stored content
    originalContent.clear();
  } catch (error) {
    console.error("Error cleaning up all search highlights:", error);
  }
};
