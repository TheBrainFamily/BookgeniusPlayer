import { Book, bookName, booksIcon } from "../../services/wolne-lektury/utils";
import inquirer from "inquirer";
import { WolneLekturyService } from "../../services/wolne-lektury";
import fs from "fs";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { sortBooksInChronologicalOrder, verifyBookBegin } from "./utils";
import { convertBook } from "../fb2-converter";

const wolneLekturyService = new WolneLekturyService();

const questions = {
  askAboutBookTitle: () => ({
    type: "input" as const,
    name: "bookTitle",
    message: "📖 Type the book title or press enter to see all books...",
  }),
  askAboutWhichBook: (books: Book[]) => ({
    type: "list" as const,
    name: "whichBook",
    message: "What book would you like to download❓",
    choices: books.map((book: Book, index) => ({
      name: `${bookName(book)} ${booksIcon[index % booksIcon.length]}`,
      value: book.slug,
    })),
  }),
  askAboutBookChildren: (bookTitle: string, books: Book[]) => ({
    type: "list" as const,
    name: "bookChildren",
    message: `✨ It seems like the book ${bookTitle} is split up into tomes or parts. Would you like to download all of them or only one?`,
    choices: [
      { name: "All", value: "all" },
      ...books.map((book: Book, index) => ({
        name: `${bookName(book)} ${booksIcon[index % booksIcon.length]}`,
        value: book.slug,
      })),
    ],
  }),
  askAboutMedia: (booksSlug: string) => ({
    type: "list" as const,
    name: "downloadAudiobookFiles",
    message: `There are audiobook files available for ${booksSlug}. Would you like to download the .mp3 files?`,
    choices: [
      { name: "Yes 👍", value: true },
      { name: "No 👎", value: false },
    ],
  }),
  askAboutConvert: (booksSlug: string) => ({
    type: "list" as const,
    name: "runConvert",
    message: `✨ Would you like to convert the files for ${booksSlug}?`,
    choices: [
      { name: "Yes 👍", value: true },
      { name: "No 👎", value: false },
    ],
  }),
};

const createBookDirectories = (bookSlug: string, needAudio: boolean) => {
  if (!fs.existsSync(`./books-data/${bookSlug}`)) {
    Object.values(FILE_TYPE).forEach((fileType) => {
      fs.mkdirSync(`./books-data/${bookSlug}/${fileType}`, { recursive: true });
    });
    if (needAudio) {
      fs.mkdirSync(`./books-data/${bookSlug}/${FILE_TYPE.INPUT}/audiobook`, { recursive: true });
    }
  }
};

const downloadBookFiles = async (books: Book[], needAudio: boolean) => {
  for await (const book of books) {
    const bookSlug = book.slug;
    createBookDirectories(bookSlug, needAudio);
    await wolneLekturyService.downloadBookFb2(bookSlug);
    if (needAudio) {
      await wolneLekturyService.downloadAudiobookMp3(bookSlug);
    }
  }
};

const downloadAudioIfAvailable = async (books: Book[]): Promise<boolean> => {
  const booksWithAvailableAudio = books.filter((book) => book.has_audio);

  if (!booksWithAvailableAudio.length) return false;

  const booksSlug = booksWithAvailableAudio.map((book) => book.slug).join(", ");
  const { downloadAudiobookFiles } = await inquirer.prompt([questions.askAboutMedia(booksSlug)]);
  return downloadAudiobookFiles as boolean;
};

(async () => {
  const { bookTitle } = await inquirer.prompt([questions.askAboutBookTitle()]);

  const books: Book[] = await wolneLekturyService.getBooksByTitle(bookTitle.trim());

  const { whichBook } = await inquirer.prompt([questions.askAboutWhichBook(books)]);

  const detailedBookData = await wolneLekturyService.getBookBySlug(whichBook);

  let booksToProcess: Book[];

  if (detailedBookData.children.length > 0) {
    const { bookChildren } = await inquirer.prompt([
      questions.askAboutBookChildren(detailedBookData.title, detailedBookData.children),
    ]);

    booksToProcess =
      bookChildren === "all"
        ? sortBooksInChronologicalOrder(detailedBookData.children)
        : detailedBookData.children.filter((book) => book.slug === bookChildren);
  } else {
    booksToProcess = books.filter((book) => book.slug === whichBook);
  }

  const needAudio = await downloadAudioIfAvailable(booksToProcess);

  await downloadBookFiles(booksToProcess, needAudio);

  const booksSlug = booksToProcess.map((book) => book.slug).join(", ");

  const { runConvert } = await inquirer.prompt([questions.askAboutConvert(booksSlug)]);

  if (runConvert) {
    let lastChapter: number = 0;
    let lastNoteId: number = 0;

    for (const book of booksToProcess) {
      const bookSlug = book.slug;
      console.log(`🚀 Starting book conversion process for ${bookSlug}...`);

      console.log(`🚀 Verifying book ${bookSlug}...`);
      const { startFromChapter, startFromNoteId } = await verifyBookBegin(bookSlug, lastChapter, lastNoteId);

      console.log(`🚀 Book verified, starting conversion...`);
      const result = convertBook(bookSlug, startFromChapter, startFromNoteId);
      console.log(`🚀 Wow! The book ${bookSlug} has been converted successfully.`);
      lastChapter = result.lastChapter;
      lastNoteId = lastNoteId + result.lastNoteId;
    }
  } else {
    console.log("The book has not been converted.");
    process.exit(0);
  }
})();
