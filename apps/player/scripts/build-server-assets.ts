import fs from "fs";
import path from "path";
import { parseBookXmlData } from "./generateBook";
import { xmlToComplexHtml } from "./data/xmlToComplexHtml";
import { validateAndNormalizeBookPath } from "./validateAndNormalizeBookPath";

async function buildServerAssets() {
  const args = process.argv.slice(2);
  const { bookDirectoryPath } = validateAndNormalizeBookPath(args);

  console.log(`📚 Building server assets for book at: ${bookDirectoryPath}`);

  try {
    // 1. Parse book data using existing functions
    const { metadata, bookString } = parseBookXmlData(bookDirectoryPath);
    // Call the function which now returns chapterHtmls
    // @ts-expect-error - TODO: fix this
    const { chapterHtmls, chapterTitles } = xmlToComplexHtml(bookString, metadata.slug, metadata.language);

    throw new Error("FIXME: chapterHtmls not available in xmlToComplexHtml");

    // 2. Create the output directory
    const outputDir = path.resolve("dist-server", metadata.slug);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 3. Generate and save the HTML files (the CORRECT way)
    const fullBookHtml = chapterHtmls.join("");
    const chapter1Html = chapterHtmls.length > 0 ? chapterHtmls[0] : "";

    fs.writeFileSync(path.join(outputDir, "full-book.html"), fullBookHtml, "utf-8");
    fs.writeFileSync(path.join(outputDir, "chapter-1.html"), chapter1Html, "utf-8");

    // 4. Save the book's metadata
    const metadataOutput = { ...metadata, chapterTitles };
    fs.writeFileSync(path.join(outputDir, "metadata.json"), JSON.stringify(metadataOutput, null, 2), "utf-8");

    console.log(`🎉 Server assets generated successfully for ${metadata.slug}`);
    console.log(`📁 Output directory: ${outputDir}`);
  } catch (error) {
    console.error(`❌ Asset generation failed:`);
    if (error instanceof Error) {
      console.error("Message:", error.message);
    } else {
      console.error("An unknown error occurred:", error);
    }
    process.exit(1);
  }
}

buildServerAssets();
