import { getBookData } from "../shared-books-data/getBooksData";
import {
  getParagraphsFromChapterWithText,
  getSectionAttributes,
} from "./getParagraphsFromChapterWithText";

export const getParagraphsFromChapter = (
  chapter: number,
  clean: boolean = false,
  pureText = false,
) => {
  const { bookText } = getBookData();
  return getParagraphsFromChapterWithText(chapter, bookText, clean, pureText);
};

/**
 * Get section-level attributes for a chapter (e.g., data-epub-type, data-chapter-format)
 * These are needed to preserve semantic information when rewrapping sections after AI processing.
 */
export const getSectionAttributesFromChapter = (chapter: number): Record<string, string> => {
  const { bookText } = getBookData();
  return getSectionAttributes(chapter, bookText);
};

if (require.main === module) {
  const paragraphs = getParagraphsFromChapter(26, true);
  console.log(paragraphs);
}
