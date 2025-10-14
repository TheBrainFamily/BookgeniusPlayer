import type { Location } from "@player/state/LocationContext";
import { useBookContentStore } from "@player/stores/bookContent.store";
import { textCacheManager } from "@player/logic/TextCacheManager";
import { bookDataLoader } from "@player/services/bookDataLoader";

export function getSurroundingText(location: Location, expand: boolean = false): string {
  const { earliestVisibleParagraph, latestVisibleParagraph, earliestVisibleChapter, latestVisibleChapter } = location;

  let earliestParagraphToConsider = earliestVisibleParagraph;
  if (expand) {
    if (bookDataLoader.getCurrentBook() === "play") {
      earliestParagraphToConsider = Math.max(1, earliestVisibleParagraph - 30);
    } else {
      earliestParagraphToConsider = Math.max(1, earliestVisibleParagraph - 2);
    }
  }
  console.log("getting surrounding text for location", location);
  // Ensure cache is populated up to the end location
  textCacheManager.ensureCacheUpto(latestVisibleChapter, latestVisibleParagraph);

  // Get the text cache
  const { textCache } = useBookContentStore.getState();

  // Collect all text between the start and end locations
  const textParts: string[] = [];

  // Iterate through chapters from start to end
  for (let chapterId = earliestVisibleChapter; chapterId <= latestVisibleChapter; chapterId++) {
    const chapterCache = textCache[chapterId];
    if (!chapterCache) continue;

    // Determine paragraph range for this chapter
    let startPara: number;
    let endPara: number;

    if (chapterId === earliestVisibleChapter && chapterId === latestVisibleChapter) {
      // Same chapter: use the exact paragraph range
      startPara = earliestParagraphToConsider;
      endPara = latestVisibleParagraph;
    } else if (chapterId === earliestVisibleChapter) {
      // First chapter: start from the specified paragraph to the end
      startPara = earliestParagraphToConsider;
      endPara = Math.max(...Object.keys(chapterCache).map(Number));
    } else if (chapterId === latestVisibleChapter) {
      // Last chapter: from beginning to the specified end paragraph
      startPara = Math.min(...Object.keys(chapterCache).map(Number));
      endPara = latestVisibleParagraph;
    } else {
      // Middle chapters: include all paragraphs
      const paragraphIndices = Object.keys(chapterCache)
        .map(Number)
        .sort((a, b) => a - b);
      if (paragraphIndices.length === 0) continue;
      startPara = paragraphIndices[0];
      endPara = paragraphIndices[paragraphIndices.length - 1];
    }

    // Collect text from each paragraph in the range
    for (let paraIndex = startPara; paraIndex <= endPara; paraIndex++) {
      const paragraphText = chapterCache[paraIndex];
      if (paragraphText) {
        textParts.push(paragraphText);
      }
    }
  }

  // Join all text parts with spaces
  return textParts.join(" ");
}
