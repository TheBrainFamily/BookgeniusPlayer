import fs from "fs";
import path from "path";
import { setCurrentBook } from "../../src/helpers/getCurrentBook";
import { FILE_TYPE, getFilePath } from "../../src/helpers/filesHelpers";
import { readBookFile } from "../../src/helpers/readBookFile";
import { identifyAndRewriteParagraphs } from "../../src/tools/identifyEntityAndRewriteParagraphs";
import { convex } from "./convex-client";
import type { NewReferenceCardsResponse } from "../../src/types";

function getRepoRoot(): string {
  return path.resolve(__dirname, "../../");
}

function setBookArg(slug: string) {
  const bookArg = path.join("books-data", slug);
  try {
    setCurrentBook(bookArg);
  } catch (_) {
    process.argv[2] = bookArg;
  }
}

function deleteChapterFiles(chapter: number): string[] {
  const deletedFiles: string[] = [];

  const mainFile = getFilePath(
    `rewritten-paragraphs-for-chapter-${chapter}.xml`,
    FILE_TYPE.TEMPORARY,
  );
  if (fs.existsSync(mainFile)) {
    fs.unlinkSync(mainFile);
    deletedFiles.push(mainFile);
  }

  for (let chunkIndex = 0; chunkIndex < 20; chunkIndex++) {
    const chunkFile = getFilePath(
      `rewritten-paragraphs-for-chapter-${chapter}-chunk-${chunkIndex}.xml`,
      FILE_TYPE.TEMPORARY,
    );
    if (fs.existsSync(chunkFile)) {
      fs.unlinkSync(chunkFile);
      deletedFiles.push(chunkFile);
    } else {
      break;
    }
  }

  return deletedFiles;
}

export async function regenerateChapter(
  slug: string,
  chapter: number,
  options: { uploadToConvex?: boolean; bookPath?: string } = {},
): Promise<{ success: boolean; error?: string; deletedFiles?: string[] }> {
  const repoRoot = getRepoRoot();
  process.chdir(repoRoot);

  setBookArg(slug);

  console.log(`[regenerateChapter] Regenerating chapter ${chapter} for ${slug}`);

  const deletedFiles = deleteChapterFiles(chapter);
  console.log(`[regenerateChapter] Deleted ${deletedFiles.length} existing files`);

  let referenceCards: NewReferenceCardsResponse;
  try {
    referenceCards = JSON.parse(
      readBookFile("single-summary-per-person.json", FILE_TYPE.PERMANENT),
    ) as NewReferenceCardsResponse;
  } catch (e) {
    return { success: false, error: "Failed to read reference cards" };
  }

  const charactersForChapter = referenceCards.characters.map((c) => ({
    name: c.name,
    summary: c.referenceCard,
  }));

  try {
    await identifyAndRewriteParagraphs(chapter, charactersForChapter);
    console.log(`[regenerateChapter] Chapter ${chapter} regenerated successfully`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Generation failed: ${msg}`, deletedFiles };
  }

  if (options.uploadToConvex && options.bookPath) {
    console.log(`[regenerateChapter] Uploading to Convex...`);
    try {
      const chapterXml = readBookFile(
        `rewritten-paragraphs-for-chapter-${chapter}.xml`,
        FILE_TYPE.TEMPORARY,
      );

      await convex.uploadFile({
        folderPath: `${options.bookPath}/chapters`,
        basename: `chapter-${chapter}.xml`,
        content: Buffer.from(chapterXml),
        contentType: "application/xml",
        publish: true,
        extra: { type: "chapter", chapterNumber: chapter, title: `Chapter ${chapter}` },
      });
      console.log(`[regenerateChapter] Uploaded chapter ${chapter} to Convex`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[regenerateChapter] Failed to upload to Convex: ${msg}`);
    }
  }

  return { success: true, deletedFiles };
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage: tsx regenerate-chapter.ts <slug> <chapter-number> [--upload]");
    console.log("Example: tsx regenerate-chapter.ts 1766836328269-the-king-in-yellow 3 --upload");
    process.exit(1);
  }

  const slug = args[0];
  const chapter = parseInt(args[1], 10);
  const shouldUpload = args.includes("--upload");

  if (isNaN(chapter)) {
    console.error("Chapter number must be a valid integer");
    process.exit(1);
  }

  const bookPath = `books/${slug}`;

  regenerateChapter(slug, chapter, { uploadToConvex: shouldUpload, bookPath }).then((result) => {
    if (result.success) {
      console.log("✅ Chapter regeneration complete");
      if (result.deletedFiles?.length) {
        console.log(`   Deleted files: ${result.deletedFiles.length}`);
      }
    } else {
      console.error(`❌ Failed: ${result.error}`);
    }
    process.exit(result.success ? 0 : 1);
  });
}
