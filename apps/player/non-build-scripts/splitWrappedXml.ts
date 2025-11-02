import fs from "fs";
import path from "path";

function splitBook(bookFolder: string) {
  const bookXmlPath = path.join(bookFolder, "wrapped.xml");
  if (!fs.existsSync(bookXmlPath)) {
    console.log(`No book.xml found in ${bookFolder}, skipping.`);
    return;
  }

  const content = fs.readFileSync(bookXmlPath, "utf8");

  const firstChapterIndex = content.indexOf("<Chapter");
  if (firstChapterIndex === -1) {
    console.log(`No chapters found in ${bookXmlPath}`);
    return;
  }

  // Create booksContent folder
  const contentDir = path.join(bookFolder, "booksContent");
  fs.mkdirSync(contentDir, { recursive: true });

  // Extract chapters
  const endEbookIndex = content.lastIndexOf("</ebook>");
  if (endEbookIndex === -1) {
    console.error(`No closing </ebook> found in ${bookXmlPath}`);
    return;
  }

  const chaptersContent = content.substring(firstChapterIndex, endEbookIndex);

  let pos = 0;
  while (pos < chaptersContent.length) {
    const start = chaptersContent.indexOf("<Chapter", pos);
    if (start === -1) break;

    const end = chaptersContent.indexOf("</Chapter>", start);
    if (end === -1) {
      console.error(`Unclosed Chapter in ${bookXmlPath}`);
      return;
    }

    const chapterBlock = chaptersContent.substring(start, end + "</Chapter>".length);

    const idMatch = chapterBlock.match(/<Chapter id="(\d+)"/);
    if (!idMatch) {
      console.error(`Chapter without id in ${bookXmlPath}`);
      return;
    }

    const chId = idMatch[1];
    const chPath = path.join(contentDir, `chapter${chId}.xml`);
    fs.writeFileSync(chPath, chapterBlock, "utf8");
    console.log(`Created ${chPath}`);

    pos = end + "</Chapter>".length;
  }
}

const doIt = () => {
  if (process.argv[2]) {
    const bookFolder = path.join(process.cwd(), process.argv[2]);
    splitBook(bookFolder);
    return;
  }
};

doIt();
