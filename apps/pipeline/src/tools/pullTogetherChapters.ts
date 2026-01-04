import { readBookFile } from "../helpers/readBookFile";
import { FILE_TYPE } from "../helpers/filesHelpers";
import { writeBookFile } from "../helpers/writeBookFile";
import { getBookSettings } from "../helpers/getBookSettings";

export const pullTogetherChapters = () => {
  let allChaptersText = "";
  const bookSettings = getBookSettings();

  const chapterTo = bookSettings.startFromChapter + bookSettings.numberOfChaptersToProcess - 1;
  for (let i = bookSettings.startFromChapter; i <= chapterTo; i++) {
    let chapterText;

    try {
      chapterText = readBookFile(`rewritten-paragraphs-for-chapter-${i}-callOpenRouter.xml`, FILE_TYPE.TEMPORARY);
    } catch {
      try {
        chapterText = readBookFile(`rewritten-paragraphs-for-chapter-${i}-callClaude.xml`, FILE_TYPE.TEMPORARY);
      } catch {
        try {
          chapterText = readBookFile(
            `rewritten-paragraphs-for-chapter-${i}-callGeminiWrapper.xml`,
            FILE_TYPE.TEMPORARY,
          );
        } catch {
          try {
            chapterText = readBookFile(`rewritten-paragraphs-for-chapter-${i}-callO3.xml`, FILE_TYPE.TEMPORARY);
          } catch {
            try {
              chapterText = readBookFile(`rewritten-paragraphs-for-chapter-${i}.xml`, FILE_TYPE.TEMPORARY);
            } catch {
              throw new Error(`rewritten-paragraphs-for-chapter-${i}.xml not found`);
            }
          }
        }
      }
    }

    // const startFormChapter = bookSettings.startFromChapter || 1;
    // const newChapterText = chapterText.replace(/<Chapter id="\d+">/, `<Chapter id="${startFormChapter}">`);
    allChaptersText += chapterText;
  }

  // Replace unclosed img tags with self-closing img tags
  const processedChaptersText = allChaptersText.replace(/<img([^>]*)>/g, "<img$1/>");
  writeBookFile("all-chapters.xml", processedChaptersText, FILE_TYPE.PERMANENT);
};
