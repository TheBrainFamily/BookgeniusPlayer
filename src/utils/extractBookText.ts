import type { BookContextChunk, BookContextLocation, ExtractedBookText } from "@/types/bookContext";

/**
 * Extract clean text from book paragraphs in the DOM
 * Similar to the logic used in searchModal.ts but focused on text extraction
 */
export async function extractBookText(fromLocation: BookContextLocation, toLocation: BookContextLocation): Promise<ExtractedBookText> {
  const chunks: BookContextChunk[] = [];

  try {
    //   // Get the bookSlug from parameter or from the current page
    //   let actualBookSlug = bookSlug;
    //   if (!actualBookSlug) {
    //     const existingChapterElement = document.querySelector("[data-book-slug]");
    //     if (!existingChapterElement) {
    //       console.warn("No chapters found in DOM for text extraction");
    //       return { chunks: [], totalChunks: 0 };
    //     }
    //     actualBookSlug = existingChapterElement.getAttribute("data-book-slug") || "book";
    //   }

    //   // Create a temporary container for search chapters if needed
    //   let searchContainer = document.getElementById("search-chapters-container");
    //   if (!searchContainer) {
    //     searchContainer = document.createElement("div");
    //     searchContainer.id = "search-chapters-container";
    //     searchContainer.style.display = "none"; // Hide from view
    //     document.body.appendChild(searchContainer);
    //   }

    //   // Load chapters that aren't already in the DOM
    //   const chaptersToLoad: number[] = [];
    //   const existingChapters = new Set<number>();

    //   // Check which chapters are already loaded
    //   document.querySelectorAll("section[data-chapter]").forEach((section) => {
    //     const chapterNum = parseInt(section.getAttribute("data-chapter") || "0");
    //     if (chapterNum > 0) {
    //       existingChapters.add(chapterNum);
    //     }
    //   });

    //   // Determine which chapters need to be loaded for extraction
    //   for (let i = fromLocation.chapter; i <= toLocation.chapter; i++) {
    //     if (!existingChapters.has(i)) {
    //       chaptersToLoad.push(i);
    //     }
    //   }

    //   // Load missing chapters into the search container
    //   const loadPromises = chaptersToLoad.map(async (chapterId) => {
    //     try {
    //       // Import the chapter module
    //       const module = await import(`../data/books/${actualBookSlug}/chapters/Chapter${chapterId}.tsx`);
    //       const ChapterComponent = module.default || module[`Chapter${chapterId}`];

    //       if (ChapterComponent && typeof ChapterComponent === "function") {
    //         // Create a temporary div to render the chapter
    //         const tempDiv = document.createElement("div");
    //         tempDiv.setAttribute("data-search-chapter", chapterId.toString());
    //         searchContainer!.appendChild(tempDiv);

    //         // Use React to render the component
    //         const { createRoot } = await import("react-dom/client");
    //         const root = createRoot(tempDiv);
    //         const React = await import("react");
    //         root.render(React.createElement(ChapterComponent));

    //         // Wait a bit for React to render
    //         await new Promise((resolve) => setTimeout(resolve, 50));
    //       }
    //     } catch (error) {
    //       console.error(`Failed to load chapter ${chapterId} for text extraction:`, error);
    //     }
    //   });

    //   // Wait for all chapters to load
    //   await Promise.all(loadPromises);

    // Extract text from the specified range
    for (let chapterIndex = fromLocation.chapter; chapterIndex <= toLocation.chapter; chapterIndex++) {
      // Look in both the normal content and the search container
      const selectors = [`section[data-chapter="${chapterIndex}"]`, `[data-search-chapter="${chapterIndex}"] section[data-chapter="${chapterIndex}"]`];

      let pageElement: Element | null = null;
      for (const selector of selectors) {
        pageElement = document.querySelector(selector);
        if (pageElement) break;
      }

      if (!pageElement) continue;

      const paragraphs = pageElement.querySelectorAll<HTMLElement>(`[data-index]`);

      paragraphs.forEach((paragraphElement) => {
        const paragraphNumberAttr = paragraphElement.getAttribute("data-index");
        if (!paragraphNumberAttr) return;

        const paragraphNumber = parseInt(paragraphNumberAttr, 10);

        // Determine if this paragraph should be included based on the range
        let shouldInclude = false;

        if (chapterIndex === fromLocation.chapter && chapterIndex === toLocation.chapter) {
          // Same chapter: check paragraph range
          shouldInclude = paragraphNumber >= fromLocation.paragraph && paragraphNumber <= toLocation.paragraph;
        } else if (chapterIndex === fromLocation.chapter) {
          // First chapter: include from fromLocation.paragraph onwards
          shouldInclude = paragraphNumber >= fromLocation.paragraph;
        } else if (chapterIndex === toLocation.chapter) {
          // Last chapter: include up to toLocation.paragraph
          shouldInclude = paragraphNumber <= toLocation.paragraph;
        } else {
          // Middle chapters: include all paragraphs
          shouldInclude = true;
        }

        if (!shouldInclude) return;

        const paragraphClone = paragraphElement.cloneNode(true) as HTMLElement;

        // Remove anchor tags to get clean text
        const anchors = paragraphClone.querySelectorAll("a.anchor");
        anchors.forEach((anchor) => anchor.remove());

        const paragraphText = (paragraphClone.textContent || "")
          .replace(/[\n\r]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (paragraphText) {
          chunks.push({ chapter: chapterIndex, paragraph: paragraphNumber, text: paragraphText });
        }
      });
    }
  } catch (error) {
    console.error("Error in extractBookText:", error);
  }

  return { chunks, totalChunks: chunks.length };
}

/**
 * Extract text from the beginning of the book up to the current location
 */
export async function extractBookTextUpToLocation(currentLocation: BookContextLocation): Promise<ExtractedBookText> {
  return extractBookText({ chapter: 1, paragraph: 1 }, currentLocation);
}

/**
 * Extract text from a specific location onwards up to another location
 */
export async function extractBookTextFromLocation(fromLocation: BookContextLocation, toLocation: BookContextLocation): Promise<ExtractedBookText> {
  return extractBookText(fromLocation, toLocation);
}
