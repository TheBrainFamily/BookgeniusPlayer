import fs from "fs";
import path from "path";
import { convertFb2 } from "./fb2Converter";
import { convertHtmlToXml } from "./convertHtmlToXml";

export const findFb2FilePath = (bookDataDirInput: string): string | null => {
  const files = fs.readdirSync(bookDataDirInput);
  const fb2File = files.find((file) => file.toLowerCase().endsWith(".fb2"));
  if (!fb2File) {
    console.error(`No .fb2 file found in the ${bookDataDirInput}. Please check the directory and try again.`);
    process.exit(1);
  }

  return path.join(bookDataDirInput, fb2File);
};

export const convertBook = (bookSlug: string, startFromChapter: number = 0, startFromNoteId: number = 0) => {
  const bookDataDirInput = `./books-data/${bookSlug}/input`;

  const bookFb2FilePath = findFb2FilePath(`${bookDataDirInput}`);
  const text = fs.readFileSync(`./${bookFb2FilePath}`, "utf-8");

  try {
    const result = convertFb2(text, { startFromChapter, startFromNoteId });

    if (!fs.existsSync(`${bookDataDirInput}`)) {
      fs.mkdirSync(`${bookDataDirInput}`, { recursive: true });
    }

    // No longer writing bookChapters.xml; chapters are generated dynamically from rich.xml

    const bookTextXml = convertHtmlToXml(result.textHtml);
    const bookTextXmlPath = `${bookDataDirInput}/rich.xml`;

    fs.writeFileSync(bookTextXmlPath, bookTextXml, "utf8");
    console.log(`${bookSlug} Rich XML saved to ${bookDataDirInput}/rich.xml`);

    return result;
  } catch (error) {
    console.error("Conversion failed:", error);
    process.exit(1);
  }
};

if (require.main === module) {
  const bookTitle = process.argv[2] || process.env.BOOK_TITLE;
  const startFromChapter = process.argv[3] || process.env.START_FROM_CHAPTER || 0;
  const startFromNoteId = process.argv[4] || process.env.START_FROM_NOTE_ID || 0;

  if (!bookTitle) {
    console.error("Please provide the $BOOK_TITLE as a first argument!");
    process.exit(1);
  }

  convertBook(bookTitle, +startFromChapter, +startFromNoteId);
}
