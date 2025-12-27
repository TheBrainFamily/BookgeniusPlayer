import fs from "fs";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { JSDOM } from "jsdom";
import inquirer from "inquirer";
import { wrapChaptersWithSections } from "./wrapChaptersWithSections";
import { Book } from "../../services/wolne-lektury/utils";

const getThreeFirstChapters = (dom: JSDOM) => {
  const document = dom.window.document;

  const sections = document.querySelectorAll("section");

  const threeFirstChapters = Array.from(sections)
    .filter((section) => {
      return section?.children[0]?.tagName === "TITLE" && section?.children[1]?.tagName === "P";
    })
    .slice(0, 3)
    .map((section) => {
      const regex = new RegExp(`<p>(.*?)</p>`, "gi");
      if (section?.textContent) {
        const match = regex.exec(section.textContent);
        return match ? match[1] : undefined;
      }
      return undefined;
    });

  return threeFirstChapters;
};

export const verifyBookBegin = async (bookSlug: string, lastChapter = 0, lastNoteId = 1) => {
  const text = fs.readFileSync(`./books-data/${bookSlug}/${FILE_TYPE.INPUT}/${bookSlug}.fb2`, "utf-8");
  let dom = new JSDOM(text);

  let threeFirstChapters = getThreeFirstChapters(dom);
  if (threeFirstChapters.length === 0) {
    const wrappedText = wrapChaptersWithSections(text);
    fs.writeFileSync(`./books-data/${bookSlug}/${FILE_TYPE.INPUT}/${bookSlug}.fb2`, wrappedText);
    console.log(`🚀 Book ${bookSlug} wrapped with sections`);
    dom = new JSDOM(wrappedText);
    threeFirstChapters = getThreeFirstChapters(dom);
  }

  let firstChapter;
  console.log(`🚀 Last chapter: ${lastChapter}`);
  if (lastChapter === 0) {
    const verifyChapterQuestion = [
      {
        type: "list" as const,
        name: "setFirstChapter",
        message: "Which one of those sections should be considered the first chapter of the book?",
        choices: threeFirstChapters.map((option, index) => ({ name: `Section ${index + 1}: ${option}`, value: index })),
      },
    ];

    console.log(`🚀 Three first chapters: ${threeFirstChapters}`);
    const verifyChapterAnswer = await inquirer.prompt(verifyChapterQuestion);
    const { setFirstChapter } = verifyChapterAnswer;
    firstChapter = setFirstChapter;
  }
  console.log(`🚀 First chapter: ${firstChapter}`);

  const startFromNoteId = lastNoteId + 1;

  const startFromChapter = (() => {
    if (lastChapter === 0) {
      if (firstChapter === 0) return 1;
      if (firstChapter === 1) return 0;
      if (firstChapter > 1) return (firstChapter - 1) * -1;
      return 0;
    } else {
      return lastChapter + 1;
    }
  })();

  return { startFromChapter, startFromNoteId };
};

export const sortBooksInChronologicalOrder = (books: Book[]) => {
  return books.sort((a, b) => {
    const getNumericId = (key: string) => {
      const parts = key.split("$");
      return parseInt(parts[parts.length - 1]) || 0;
    };

    const idA = getNumericId(a.full_sort_key);
    const idB = getNumericId(b.full_sort_key);

    return idA - idB;
  });
};
