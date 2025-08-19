import fs from "fs";
import path from "path";

export function buildBookFromContent(bookDirectoryPath: string, isDemo: boolean = false): void {
  const booksContentPath = path.join(bookDirectoryPath, "booksContent");
  const bookXmlPath = path.join(bookDirectoryPath, "book.xml");

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
    if (isDemo) {
      // Check for DemoChapters in metadata
      const demoChaptersMatch = metadataContent.match(/<DemoChapters>([^<]+)<\/DemoChapters>/);
      if (demoChaptersMatch) {
        demoChapters = demoChaptersMatch[1].split(",").map((num) => parseInt(num.trim()));
      } else {
        // Default: 1 chapter for normal books, 2 for plays
        const formMatch = metadataContent.match(/<Form>([^<]+)<\/Form>/);
        const isPlay = formMatch && formMatch[1].toLowerCase() === "play";
        demoChapters = isPlay ? [1, 2] : [1];
      }
      console.log(`   Demo mode: Including chapters ${demoChapters.join(", ")}`);
    }

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
    if (demoChapters) {
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
    fs.writeFileSync(bookXmlPath, bookXmlContent, "utf8");
    console.log(`✅ Successfully built book.xml from booksContent files`);
  } catch (error) {
    console.error(`❌ Failed to build book.xml from booksContent:`, error);
    throw error;
  }
}
