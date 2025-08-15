import { highlightSearchQuery, removeHighlights } from "@player/utils/highlightSearchQuery";

export const highlightSearchInParagraph = (chapter: number, paragraphNumber: number, searchQuery: string, delay: number = 200): void => {
  setTimeout(() => {
    try {
      const paragraphSelector = `section[data-chapter="${chapter}"] [data-index="${paragraphNumber}"]`;
      const paragraphElement = document.querySelector(paragraphSelector) as HTMLElement;

      if (!paragraphElement) {
        console.warn(`Paragraph not found: ${paragraphSelector}`);
        return;
      }

      highlightSearchQuery(paragraphElement, searchQuery);

      // Remove highlight after a delay and restore original content
      setTimeout(() => {
        const paragraphSelector = `section[data-chapter="${chapter}"] [data-index="${paragraphNumber}"]`;
        const paragraphElement = document.querySelector(paragraphSelector) as HTMLElement;
        removeHighlights(paragraphElement);
      }, 5000); // Remove after 5 seconds
    } catch (error) {
      console.error("Error highlighting search text:", error);
      const paragraphSelector = `section[data-chapter="${chapter}"] [data-index="${paragraphNumber}"]`;
      const paragraphElement = document.querySelector(paragraphSelector) as HTMLElement;
      removeHighlights(paragraphElement);
    }
  }, delay);
};
