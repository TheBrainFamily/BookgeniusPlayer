import path from "path";
import { execSync } from "child_process";
import fs from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { setKnownVideos } from "@/utils/getFilePathsForName";
import { generateBookDataFromHtml } from "./generateBookDataFromHtml";

interface BookMetadata {
  title: string;
  // Add other metadata properties if they exist
}

interface BookData {
  slug: string;
  metadata: BookMetadata;
  // Add other bookData properties if they exist
}

async function start() {
  const args = process.argv.slice(2); // Skip node executable and script path

  if (args.length === 0) {
    console.error("Error: Please provide the path to the book directory.");
    console.log("Usage: pnpm start <path_to_book_directory>");
    process.exit(1);
  }

  const bookDirectoryPath = args[0];
  // Construct an absolute path for the import, as dynamic imports are relative to the current file or use absolute paths.
  // process.cwd() gives the directory where the pnpm command was run.
  const bookDataPath = path.resolve(process.cwd(), bookDirectoryPath, "bookData.ts");

  const parser = new DOMParser();
  const book = fs.readFileSync(`${bookDirectoryPath}/book.xml`, "utf8");
  const xmlDoc = parser.parseFromString(book, "text/xml");
  const bookSlug = xmlDoc.getElementsByTagName("BookSlug")[0].textContent;
  // const chapters = xmlDoc.getElementsByTagName("Chapter");
  // const chapterNumber = chapters.length;

  const bookOutputPath = path.resolve("src", "books", bookSlug);

  if (!fs.existsSync(bookOutputPath)) {
    fs.mkdirSync(bookOutputPath);
  }

  ["backgroundsForBook.ts", "getBackgroundSongsForBook.ts", "getCutScenesForBook.ts"].forEach((mediaBookFile) => {
    fs.copyFileSync(path.join(bookDirectoryPath, mediaBookFile), path.join(bookOutputPath, mediaBookFile), fs.constants.COPYFILE_FICLONE);
  });

  // getKnownVideoFiles.ts

  const assetsPath = path.join(bookDirectoryPath, "assets");
  const videoFiles = fs
    .readdirSync(assetsPath)
    .filter((file) => file.endsWith(".mp4"))
    .map((file) => file);

  setKnownVideos(videoFiles);

  const getKnownVideoFiles = `export const getKnownVideoFiles = () => {\n return ${JSON.stringify(videoFiles, null, 2)} \n};`;
  fs.writeFileSync(path.join(bookOutputPath, "getKnownVideoFiles.ts"), getKnownVideoFiles, "utf-8");

  // getBookStringified.ts

  generateBookDataFromHtml();

  // const command = `tsx ./generateBookDataFromHtml.ts ${bookDirectoryPath}`;
  // child_process.execSync(command);

  try {
    console.log(`Attempting to load book data from: ${bookDataPath}`);
    // For dynamic imports with tsx/ESM, the path needs to be valid URL or absolute path.
    // On Windows, path.resolve will produce paths like C:\... which needs to be file:///C:/...
    // On Unix, /path/to/file is fine.

    const bookDataFilePath = path.join(bookOutputPath, "bookData.ts");
    const bookDataModulePath = path.sep === "\\" ? `file:///${bookDataFilePath.replace(/\\/g, "/")}` : bookDataFilePath;
    console.log("80: bookOutputPath BANG!", bookOutputPath);
    console.log("77: bookDataPath BANG!", bookDataFilePath);
    const bookModule = (await import(bookDataModulePath)) as { bookData: BookData };
    const { bookData } = bookModule;

    if (!bookData || !bookData.slug || !bookData.metadata || !bookData.metadata.title) {
      console.error('Error: Invalid bookData.ts structure. It must export a default object with "slug" and "metadata.title" properties.');
      console.error("Found:", JSON.stringify(bookData, null, 2));
      process.exit(1);
    }

    const viteBook = bookData.slug;
    const viteBookName = bookData.metadata.title;

    // Ensure book names with spaces are handled correctly by quoting.
    const command = `VITE_BOOK='${viteBook}' VITE_BOOK_NAME='${viteBookName.replace(/'/g, "'\\''")}' VITE_BOOK_PATH='${bookDirectoryPath}' vite dev`;

    console.log(`Executing: ${command}`);

    execSync(command, { stdio: "inherit" });
  } catch (error) {
    console.error(`Error starting the development server for ${bookDirectoryPath}:`);
    if (error instanceof Error) {
      console.error("Message:", error.message);
    } else {
      console.error("An unknown error occurred:", error);
    }
    if (error && typeof error === "object" && "code" in error && error.code === "ERR_MODULE_NOT_FOUND") {
      console.error(`Could not find module. Please ensure the file exists and is correctly referenced: ${bookDataPath}`);
    }
    process.exit(1);
  }
}

start();
