import { getBookData } from "../shared-books-data/getBooksData";
import { getParagraphsFromChapterWithText } from "./getParagraphsFromChapterWithText";

export const getParagraphsFromChapter = (chapter: number, clean: boolean = false, pureText = false) => {
  const { bookText } = getBookData();
  return getParagraphsFromChapterWithText(chapter, bookText, clean, pureText);
};

if (require.main === module) {
  const paragraphs = getParagraphsFromChapter(26, true);
  console.log(paragraphs);
}
