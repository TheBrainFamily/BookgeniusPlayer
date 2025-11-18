import fs from "fs";
import path from "path";
import { returnDemoChapterNumbers } from "./returnDemoChapterNumbers";

export function buildBookFromContent(bookDirectoryPath: string, isDemo: boolean = false): void {
  const booksContentPath = path.join(bookDirectoryPath, "booksContent");

  if (!fs.existsSync(booksContentPath)) {
    console.log(`No booksContent directory found at ${booksContentPath}, skipping book.xml generation`);
    return;
  }

  try {
    // Read metadata.xml
    const metadataPath = path.join(booksContentPath, "metadata.xml");
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`metadata.xml not found at ${metadataPath}`);
    }

    const metadataContent = fs.readFileSync(metadataPath, "utf8");

    // Extract the content between <ebook> tags, excluding the closing </ebook>
    const metadataMatch = metadataContent.match(/<ebook[^>]*>([\s\S]*?)<\/ebook>/);
    if (!metadataMatch) {
      throw new Error("Invalid metadata.xml format - could not find <ebook> tags");
    }

    const metadataInnerContent = metadataMatch[1].trim();

    // Extract demo chapters if in demo mode
    let demoChapters: number[] | null = null;
    demoChapters = returnDemoChapterNumbers(metadataContent);

    // Read all chapter files
    let chapterFiles = fs
      .readdirSync(booksContentPath)
      .filter((file) => file.startsWith("chapter") && file.endsWith(".xml"))
      .sort((a, b) => {
        // Extract chapter numbers for proper sorting
        const aNum = parseInt(a.match(/chapter(\d+)\.xml/)?.[1] || "0");
        const bNum = parseInt(b.match(/chapter(\d+)\.xml/)?.[1] || "0");
        return aNum - bNum;
      });

    // Filter chapters for demo mode
    if (isDemo) {
      console.log(`📚 Creating demo book with chapters: ${demoChapters.join(", ")}`);

      chapterFiles = chapterFiles.filter((file) => {
        const chapterNum = parseInt(file.match(/chapter(\d+)\.xml/)?.[1] || "0");
        return demoChapters.includes(chapterNum);
      });
    }

    // Read chapter contents
    const chaptersContent = chapterFiles
      .map((file) => {
        const chapterPath = path.join(booksContentPath, file);
        const chapterContent = fs.readFileSync(chapterPath, "utf8").trim();
        return chapterContent;
      })
      .join("\n\n");

    // Extract the opening <ebook> tag with all its attributes
    const openingTagMatch = metadataContent.match(/<ebook[^>]*>/);
    if (!openingTagMatch) {
      throw new Error("Could not extract opening <ebook> tag from metadata.xml");
    }
    const openingTag = openingTagMatch[0];

    // Build the complete book.xml
    const bookXmlContent = `<?xml version="1.0" encoding="UTF-8" ?>
${openingTag}

${metadataInnerContent}

${chaptersContent}

</ebook>`;

    // Write the book.xml file
    fs.writeFileSync(path.join(bookDirectoryPath, "book.xml"), bookXmlContent, "utf8");
    console.log(`✅ Successfully built book.xml from booksContent files`);
  } catch (error) {
    console.error(`❌ Failed to build book.xml from booksContent:`, error);
    throw error;
  }
}
