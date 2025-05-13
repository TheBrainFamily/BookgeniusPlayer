import { BOOK_SLUGS } from "@/consts";
import { getTalkingMediaFilePathForName } from "@/utils/getFilePathsForName";

export function isAppearanceWithinRange(
  appearance: { chapterNumber: number; paragraphNumber: number },
  startChapter: number,
  startParagraph: number,
  endChapter?: number,
  endParagraph?: number,
): boolean {
  const { chapterNumber, paragraphNumber } = appearance;

  // If no end chapter/paragraph is defined, treat it as a single paragraph check
  const effectiveEndChapter = endChapter === undefined ? startChapter : endChapter;
  const effectiveEndParagraph = endParagraph === undefined ? startParagraph : endParagraph;

  // Single chapter range
  if (startChapter === effectiveEndChapter) {
    return chapterNumber === startChapter && paragraphNumber >= startParagraph && paragraphNumber <= effectiveEndParagraph;
  }

  // Multi-chapter range cases:
  // Case 1: Paragraphs in the start chapter, at or after startParagraph
  if (chapterNumber === startChapter && paragraphNumber >= startParagraph) {
    return true;
  }
  // Case 2: Paragraphs in chapters strictly between start and end chapters
  if (chapterNumber > startChapter && chapterNumber < effectiveEndChapter) {
    return true;
  }
  // Case 3: Paragraphs in the end chapter, at or before endParagraph
  if (chapterNumber === effectiveEndChapter && paragraphNumber <= effectiveEndParagraph) {
    return true;
  }

  return false; // Not in range
}

export function activateCharacters(chapterNum: number, paragraphNum: number, bookSlug: string, endChapter?: number, endParagraph?: number, onlyTalking = false) {
  const entityNotes = document.querySelectorAll<HTMLElement>("#left-notes .entity-note");
  entityNotes.forEach((note) => {
    const appearancesStr = note.dataset.appearances;
    const canonicalName = note.dataset.canonicalName;
    if (!appearancesStr || !canonicalName) return;

    try {
      const appearances: { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean }[] = JSON.parse(appearancesStr);
      let isInRange = false;
      let isTalkingInRange = false;

      // Check if any appearance falls within the specified range
      for (const app of appearances) {
        if (isAppearanceWithinRange(app, chapterNum, paragraphNum, endChapter, endParagraph)) {
          isInRange = true;
          if (app.isTalkingInParagraph) {
            isTalkingInRange = true;
            break; // Found talking in range, no need to check further appearances for this entity
          } else {
            // Empty block removed
          }
        }
      }

      const imageElement = note.querySelector<HTMLImageElement>(".entity-image");

      if (isTalkingInRange) {
        note.classList.add("highlighted-talking-entity");
        // Swap image to GIF if talking
        if (imageElement && imageElement.dataset.originalSrc) {
          const gifSrc = getTalkingMediaFilePathForName(canonicalName, bookSlug as BOOK_SLUGS);
          const currentSrcFilename = imageElement.src.split("/").pop();
          const gifSrcFilename = gifSrc.split("/").pop();
          if (currentSrcFilename !== gifSrcFilename) {
            imageElement.src = gifSrc;
          }
        }
      } else if (isInRange && !onlyTalking) {
        console.log("are we in this weird !onlyTalking case?", canonicalName);
        note.classList.add("highlighted-entity");
        // Ensure image is PNG if just mentioned (and was previously GIF)
        if (imageElement && imageElement.dataset.originalSrc) {
          const currentSrcFilename = imageElement.src.split("/").pop();
          const originalSrcFilename = imageElement.dataset.originalSrc.split("/").pop();
          if (currentSrcFilename !== originalSrcFilename) {
            imageElement.src = imageElement.dataset.originalSrc;
          }
        }
      } else {
        // If not in range, or only showing talking entities and this one isn't talking in range
        // console.log(`GOZDECKI NOT IN RANGE OR NOT TALKING IN RANGE FOR ${canonicalName}`);
        // Ensure image is PNG if it was changed
        if (imageElement && imageElement.dataset.originalSrc) {
          const currentSrcFilename = imageElement.src.split("/").pop();
          const originalSrcFilename = imageElement.dataset.originalSrc.split("/").pop();
          if (currentSrcFilename !== originalSrcFilename) {
            imageElement.src = imageElement.dataset.originalSrc;
          }
        }
      }
    } catch (e) {
      console.error("Error processing appearances for entity highlight:", e);
    }
  });
}
