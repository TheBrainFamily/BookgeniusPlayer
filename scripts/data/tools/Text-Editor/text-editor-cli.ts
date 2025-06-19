import inquirer from "inquirer";
import { CURRENT_BOOK } from "@/consts";
import fs from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { TextEditor } from "./text-editor";

const BOOK_SLUG = CURRENT_BOOK;

const questions = {
  askAboutChapter: (chapters: { id: string; title: string }[]) => ({
    type: "list",
    name: "chapter",
    message: `What chapter of ${BOOK_SLUG} do you want to see?`,
    choices: chapters.map((chapter) => ({ name: `${chapter.id}. ${chapter.title}`, value: chapter.id })),
    loop: false,
  }),
  askAboutParagraph: (paragraphs: { id: number; text: string }[]) => ({
    type: "list",
    name: "paragraph",
    message: `What paragraph of ${BOOK_SLUG} do you want to edit?`,
    choices: paragraphs.map((paragraph) => ({ name: `${paragraph.id}. ${paragraph.text}`, value: paragraph.id })),
    loop: false,
  }),
} as const;

(async () => {
  const parser = new DOMParser();
  const book = fs.readFileSync(`./src/data/${BOOK_SLUG}-chapters.xml`, "utf8");
  const xmlDoc = parser.parseFromString(book, "text/xml");
  const chaptersXml = xmlDoc.getElementsByTagName("Chapter");

  const chapters = Array.from(chaptersXml).map((chapter) => ({ id: chapter.getAttribute("id"), title: chapter.firstChild?.textContent?.trim() || "" }));

  const { chapter } = await inquirer.prompt(questions.askAboutChapter(chapters) as never);

  const chosenChapter = chaptersXml[chapter - 1];

  const paragraphsNode = Array.from(chosenChapter.childNodes).filter((node) => node.nodeType === 1);

  const paragraphs = Array.from(paragraphsNode).map((paragraph, index) => ({ id: index, text: paragraph.toString().trim() || "" }));

  const { paragraph } = await inquirer.prompt(questions.askAboutParagraph(paragraphs) as never);

  const chosenParagraph = paragraphs[paragraph];

  const textEditor = new TextEditor(CURRENT_BOOK);

  await textEditor.editParagraph(chapter, chosenParagraph.id);
})();
