import { useEffect, useState } from "react";

import { Location } from "@/state/LocationContext";

export interface Footnote {
  id: string;
  html: string;
}

// Helper function to check if a paragraph's location falls within the visible range
function isParagraphInRange(paragraphChapter: number, paragraphIndex: number, range: Location): boolean {
  if (range.chapter === range.endChapter) {
    // Single chapter view
    return paragraphChapter === range.chapter && paragraphIndex >= range.paragraph && paragraphIndex <= range.endParagraph;
  } else {
    // Multi-chapter view
    const inStartChapter = paragraphChapter === range.chapter && paragraphIndex >= range.paragraph;
    const inMiddleChapters = paragraphChapter > range.chapter && paragraphChapter < range.endChapter;
    const inEndChapter = paragraphChapter === range.endChapter && paragraphIndex <= range.endParagraph;
    return inStartChapter || inMiddleChapters || inEndChapter;
  }
}

export function useFootnotes(range: Location): Footnote[] {
  const [notes, setNotes] = useState<Footnote[]>([]);

  /*  watch primitive fields → effect runs only when the *value* changes  */
  useEffect(() => {
    const notesContainer = document.getElementById("right-notes-scrollable-container");
    if (!notesContainer) {
      console.warn("Footnotes container 'right-notes-scrollable-container' not found.");
      setNotes([]);
      return;
    }

    const allParagraphs = document.querySelectorAll<HTMLElement>("section[data-chapter] p[data-index]");
    const relevantFootnoteIds = new Set<string>();

    allParagraphs.forEach((paragraphElement) => {
      const sectionElement = paragraphElement.closest("section[data-chapter]") as HTMLElement | null;
      if (!sectionElement) return;

      const paragraphChapter = parseInt(sectionElement.dataset.chapter || "-1", 10);
      const paragraphIndex = parseInt(paragraphElement.dataset.index || "-1", 10);

      if (paragraphChapter < 0 || paragraphIndex < 0) return; // Skip invalid paragraphs

      if (isParagraphInRange(paragraphChapter, paragraphIndex, range)) {
        const annotationLinks = paragraphElement.querySelectorAll<HTMLAnchorElement>(".link-note");
        annotationLinks.forEach((link) => {
          const targetId = link.getAttribute("href")?.substring(1); // Get href like '#fn3' and remove '#'
          if (targetId) {
            relevantFootnoteIds.add(targetId);
          }
        });
      }
    });

    const foundNotes: Footnote[] = [];
    relevantFootnoteIds.forEach((id) => {
      const noteElement = notesContainer.querySelector<HTMLElement>(`#${id}`);
      // Ensure the note element exists and is a direct child section of the container
      if (noteElement && noteElement.parentElement === notesContainer && noteElement.tagName === "SECTION") {
        foundNotes.push({ id: noteElement.id, html: noteElement.innerHTML });
      } else if (noteElement) {
        console.warn(`Footnote element #${id} found, but not a direct child section of the container.`);
      } else {
        // This might happen if the href points to a non-existent ID
        console.warn(`Footnote element #${id} referenced in text but not found in notes container.`);
      }
    });

    // Sort notes based on their original order in the DOM, which usually corresponds to their appearance order.
    foundNotes.sort((a, b) => {
      const elementA = notesContainer.querySelector<HTMLElement>(`#${a.id}`);
      const elementB = notesContainer.querySelector<HTMLElement>(`#${b.id}`);
      // Basic check: If elements are missing during sort, keep original order (or handle error)
      if (!elementA || !elementB) return 0;

      // Compare document position
      // Node.DOCUMENT_POSITION_FOLLOWING = 4 -> elementB is after elementA
      return elementA.compareDocumentPosition(elementB) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    setNotes(foundNotes);
  }, [range.chapter, range.paragraph, range.endChapter, range.endParagraph]);

  return notes;
}
