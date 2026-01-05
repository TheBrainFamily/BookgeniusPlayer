import fs from "fs";
import path from "path";
import { convex } from "./convex-client";

async function uploadChapters(bookSlug: string) {
  const repoRoot = path.resolve(__dirname, "../../");
  const bookRoot = path.join(repoRoot, "books-data", bookSlug);
  const tempOutputDir = path.join(bookRoot, "temporary-output");
  const bookPath = `books/${bookSlug}`;

  if (!fs.existsSync(tempOutputDir)) {
    console.error(`Directory not found: ${tempOutputDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(tempOutputDir).filter((f) => f.match(/^rewritten-paragraphs-for-chapter-\d+\.xml$/));

  if (files.length === 0) {
    console.log("No chapter files found to upload");
    return;
  }

  console.log(`Found ${files.length} chapters to upload`);

  for (const file of files) {
    const match = file.match(/chapter-(\d+)/);
    if (!match) continue;

    const chapterNumber = parseInt(match[1], 10);
    const filePath = path.join(tempOutputDir, file);
    const content = fs.readFileSync(filePath);
    const basename = `chapter-${chapterNumber}.html`;

    console.log(`Uploading chapter ${chapterNumber}...`);

    try {
      await convex.uploadFile({
        folderPath: `${bookPath}/chapters-source`,
        basename,
        content,
        contentType: "text/html",
        publish: true,
        extra: { type: "chapter", chapterNumber, title: `Chapter ${chapterNumber}` },
      });
      console.log(`✔ Chapter ${chapterNumber} uploaded`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`✖ Failed to upload chapter ${chapterNumber}: ${msg}`);
    }
  }

  console.log("Done!");
}

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: tsx upload-chapters.ts <book-slug>");
  process.exit(1);
}

uploadChapters(slug);
