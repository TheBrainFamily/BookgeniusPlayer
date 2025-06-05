import path from "path";
import fs from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { setKnownVideos } from "@/utils/getFilePathsForName";
import { generateBookDataFromHtml } from "./generateBookDataFromHtml";

async function generateBookData() {
  const args = process.argv.slice(2); // Skip node executable and script path

  if (args.length === 0) {
    console.error("Error: Please provide the path to the book directory.");
    console.log("Usage: tsx generate-book-data.ts <path_to_book_directory>");
    process.exit(1);
  }

  const bookDirectoryPath = args[0];

  const parser = new DOMParser();

  // Check if book.xml exists
  const bookXmlPath = `${bookDirectoryPath}/book.xml`;
  if (!fs.existsSync(bookXmlPath)) {
    console.error(`Error: book.xml not found at ${bookXmlPath}`);
    process.exit(1);
  }

  const book = fs.readFileSync(bookXmlPath, "utf8");
  console.log("📖 Read book.xml successfully");

  const xmlDoc = parser.parseFromString(book, "text/xml");

  // Check for XML parsing errors
  const parserError = xmlDoc.getElementsByTagName("parsererror");
  if (parserError.length > 0) {
    console.error("Error: Failed to parse book.xml");
    console.error("Parser error:", parserError[0].textContent);
    process.exit(1);
  }

  const bookSlugElements = xmlDoc.getElementsByTagName("BookSlug");
  if (bookSlugElements.length === 0) {
    console.error("Error: No BookSlug element found in book.xml");
    console.log(
      "Available elements:",
      Array.from(xmlDoc.documentElement.childNodes)
        .map((node) => node.nodeName)
        .filter((name) => name !== "#text"),
    );
    process.exit(1);
  }

  const bookSlug = bookSlugElements[0].textContent;
  if (!bookSlug || bookSlug.trim() === "") {
    console.error("Error: BookSlug element is empty or null");
    console.log("BookSlug element content:", JSON.stringify(bookSlug));
    process.exit(1);
  }

  console.log(`📚 Book slug: ${bookSlug}`);

  const bookOutputPath = path.resolve("src", "books", bookSlug);

  if (!fs.existsSync(bookOutputPath)) {
    fs.mkdirSync(bookOutputPath);
  }

  // Copy media book files
  ["backgroundsForBook.ts", "getBackgroundSongsForBook.ts", "getCutScenesForBook.ts"].forEach((mediaBookFile) => {
    fs.copyFileSync(path.join(bookDirectoryPath, mediaBookFile), path.join(bookOutputPath, mediaBookFile), fs.constants.COPYFILE_FICLONE);
  });

  // Generate getKnownVideoFiles.ts
  const assetsPath = path.join(bookDirectoryPath, "assets");
  const videoFiles = fs
    .readdirSync(assetsPath)
    .filter((file) => file.endsWith(".mp4"))
    .map((file) => file);

  setKnownVideos(videoFiles);

  const getKnownVideoFiles = `export const getKnownVideoFiles = () => {\n return ${JSON.stringify(videoFiles, null, 2)} \n};`;
  fs.writeFileSync(path.join(bookOutputPath, "getKnownVideoFiles.ts"), getKnownVideoFiles, "utf-8");

  // Generate book data from HTML
  generateBookDataFromHtml();

  console.log(`✅ Book data generated successfully for ${bookSlug}`);
  console.log(`📁 Output directory: ${bookOutputPath}`);
}

generateBookData().catch((error) => {
  console.error("❌ Error generating book data:", error);
  process.exit(1);
});
