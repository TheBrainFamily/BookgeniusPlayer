import { resolveBookDir } from "../../helpers/resolveBookDir";
import { findFb2FilePath } from "../fb2-converter";
import { parseFb2Xml } from "../fb2-converter/fb2Converter";
import fs from "fs";
import { writeBookFile } from "../../helpers/writeBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";

// we need to open the .fb2 file
const bookDir = resolveBookDir();
const bookDataDirInput = `${bookDir}/input`;
const fb2FilePath = findFb2FilePath(bookDataDirInput);
if (!fb2FilePath) {
  throw new Error("Fb2 file not found");
}
const fb2FileContent = fs.readFileSync(fb2FilePath, "utf-8");

// we need to parse the .fb2 file
const fb2FileContentParsed = parseFb2Xml(fb2FileContent);

// we need to extract the notes
const notes = extractNotes(fb2FileContentParsed);

saveNotes(notes);

function extractNotes(fb2FileContentParsed: Document) {
  const notesBody = fb2FileContentParsed.querySelector("body[name='notes']");
  if (!notesBody) {
    return [];
  }

  const sections = notesBody.querySelectorAll("section");
  return Array.from(sections).map((section) => {
    const id = section.getAttribute("id");
    const content = section
      .querySelector("p")
      ?.innerHTML.replace(' xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"', "");
    return { id, content };
  });
}

function saveNotes(notes: { id: string | null; content: string | undefined }[]) {
  writeBookFile("notes.ts", `export const getNotes = () => ${JSON.stringify(notes, null, 2)};`, FILE_TYPE.PERMANENT);
}
