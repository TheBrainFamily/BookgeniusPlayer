// Annotations handling functions

export const dealWithAnnotations = ({
  startChapter,
  startParagraph,
  endChapter,
  endParagraph,
}: {
  startChapter: number;
  startParagraph: number;
  endChapter: number;
  endParagraph: number;
}) => {
  // Hide all footnote sections initially
  const allNotes = document.querySelectorAll<HTMLElement>("#right-notes-scrollable-container section");
  allNotes.forEach((note) => {
    note.style.display = "none";
  });

  // Select all paragraphs within chapter sections that have a data-index
  const allParagraphs = document.querySelectorAll("section[data-chapter] p[data-index]");
  let atLeastOneInRange = false;
  allParagraphs.forEach((paragraph) => {
    const paragraphElement = paragraph as HTMLElement;
    const sectionElement = paragraphElement.closest("section[data-chapter]") as HTMLElement | null;

    if (!sectionElement) return; // Skip if paragraph is not within a chapter section

    const paragraphChapter = parseInt(sectionElement.dataset.chapter || "-1");
    const currentParagraph = parseInt(paragraphElement.dataset.index || "-1");

    if (paragraphChapter < 0 || currentParagraph < 0) return; // Skip if data attributes are invalid

    // Check if the paragraph falls within the visible range
    let isInRange = false;
    if (startChapter === endChapter) {
      // Case 1: Single Chapter View
      isInRange = paragraphChapter === startChapter && currentParagraph >= startParagraph && currentParagraph <= endParagraph;
    } else {
      // Case 2: Multi-Chapter View
      const inStartChapter = paragraphChapter === startChapter && currentParagraph >= startParagraph;
      const inMiddleChapter = paragraphChapter > startChapter && paragraphChapter < endChapter;
      const inEndChapter = paragraphChapter === endChapter && currentParagraph <= endParagraph;
      isInRange = inStartChapter || inMiddleChapter || inEndChapter;
    }

    if (isInRange) {
      const annotations = paragraphElement.querySelectorAll<HTMLAnchorElement>(".link-note");

      annotations.forEach((annotation) => {
        const targetId = annotation.getAttribute("href")?.substring(1); // Get href like '#fn3' and remove '#'
        if (targetId) {
          atLeastOneInRange = true;

          const noteElement = document.getElementById(targetId);
          // Check if the note element exists and is within the scrollable container
          if (noteElement && noteElement.closest("#right-notes-scrollable-container")) {
            noteElement.style.display = "block";
          }
        }
      });
    }
  });

  const rightNotes = document.getElementById("right-notes");
  if (!atLeastOneInRange) {
    rightNotes.style.visibility = "hidden";
  } else {
    rightNotes.style.visibility = "visible";
  }
};
