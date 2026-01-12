import path from "path";
import fs from "fs";
import { setCurrentBook } from "../../src/helpers/getCurrentBook";
import { FILE_TYPE, getFilePath } from "../../src/helpers/filesHelpers";
import { readBookFile, doesBookFileExist } from "../../src/helpers/readBookFile";
import { writeBookFile } from "../../src/helpers/writeBookFile";
import { identifyAndRewriteParagraphs } from "../../src/tools/identifyEntityAndRewriteParagraphs";
import { convex, getChapterXml, getCharacterReferenceCards } from "./convex-client";
import { stripCharacterTags, parseXmlToParagraphs } from "./chapter-xml-helpers";

function getRepoRoot(): string {
  return path.resolve(__dirname, "../../");
}

function ensureBookDataDir(slug: string): string {
  const bookDataDir = path.join(getRepoRoot(), "books-data", slug);
  const inputDir = path.join(bookDataDir, "input");
  const outputDir = path.join(bookDataDir, "output");
  const tempDir = path.join(bookDataDir, "temporary-output");

  for (const dir of [bookDataDir, inputDir, outputDir, tempDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return bookDataDir;
}

function setBookArg(slug: string) {
  const bookArg = path.join("books-data", slug);
  try {
    setCurrentBook(bookArg);
  } catch {
    process.argv[2] = bookArg;
  }
}

function deleteExistingChapterFiles(chapter: number): string[] {
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

export async function regenerateChapterFromConvex(
  bookPath: string,
  chapterNumber: number,
): Promise<{ success: boolean; error?: string; newXml?: string }> {
  const slug = bookPath.replace(/^books\//, "");

  console.log(`[regenerateChapterFromConvex] Starting for ${bookPath} chapter ${chapterNumber}`);

  const chapterXml = await getChapterXml(bookPath, chapterNumber);
  if (!chapterXml) {
    return { success: false, error: `Chapter ${chapterNumber} not found in Convex` };
  }
  console.log(`[regenerateChapterFromConvex] Fetched chapter XML (${chapterXml.length} chars)`);

  const characterCards = await getCharacterReferenceCards(bookPath);
  if (characterCards.length === 0) {
    return { success: false, error: "No character reference cards found in Convex" };
  }
  console.log(
    `[regenerateChapterFromConvex] Found ${characterCards.length} character reference cards`,
  );

  const repoRoot = getRepoRoot();
  process.chdir(repoRoot);

  ensureBookDataDir(slug);
  setBookArg(slug);

  const strippedXml = stripCharacterTags(chapterXml);
  const { paragraphs } = parseXmlToParagraphs(strippedXml);
  console.log(`[regenerateChapterFromConvex] Parsed ${paragraphs.length} paragraphs`);

  const richXmlContent = `<Book>\n${strippedXml}\n</Book>`;
  writeBookFile("rich.xml", richXmlContent, FILE_TYPE.INPUT);
  console.log(`[regenerateChapterFromConvex] Wrote rich.xml to input folder`);

  const referenceCardsJson = {
    characters: characterCards.map((c) => ({ name: c.name, referenceCard: c.summary })),
  };
  writeBookFile(
    "single-summary-per-person.json",
    JSON.stringify(referenceCardsJson, null, 2),
    FILE_TYPE.PERMANENT,
  );
  console.log(`[regenerateChapterFromConvex] Wrote reference cards JSON`);

  const deletedFiles = deleteExistingChapterFiles(chapterNumber);
  console.log(
    `[regenerateChapterFromConvex] Deleted ${deletedFiles.length} existing chapter files`,
  );

  const charactersForChapter = characterCards.map((c) => ({ name: c.name, summary: c.summary }));

  try {
    await identifyAndRewriteParagraphs(chapterNumber, charactersForChapter);
    console.log(`[regenerateChapterFromConvex] ✅ identifyAndRewriteParagraphs completed`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `LLM processing failed: ${msg}` };
  }

  const outputFileName = `rewritten-paragraphs-for-chapter-${chapterNumber}.xml`;
  if (!doesBookFileExist(outputFileName, FILE_TYPE.TEMPORARY)) {
    return { success: false, error: "Output file was not created" };
  }

  const newXml = readBookFile(outputFileName, FILE_TYPE.TEMPORARY);
  console.log(`[regenerateChapterFromConvex] Read output (${newXml.length} chars)`);

  console.log(`[regenerateChapterFromConvex] Uploading to Convex...`);
  try {
    await convex.uploadFile({
      folderPath: `${bookPath}/chapters`,
      basename: `chapter-${chapterNumber}.xml`,
      content: Buffer.from(newXml),
      contentType: "application/xml",
      extra: {
        type: "chapter",
        chapterNumber,
        title: `Chapter ${chapterNumber}`,
        regeneratedAt: new Date().toISOString(),
      },
    });
    console.log(`[regenerateChapterFromConvex] ✅ Upload complete`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Upload failed: ${msg}`, newXml };
  }

  return { success: true, newXml };
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage: tsx regenerate-chapter-from-convex.ts <book-path> <chapter-number>");
    console.log(
      "Example: tsx regenerate-chapter-from-convex.ts books/1766836328269-the-king-in-yellow 1",
    );
    process.exit(1);
  }

  const bookPath = args[0];
  const chapterNumber = parseInt(args[1], 10);

  if (isNaN(chapterNumber)) {
    console.error("Chapter number must be a valid integer");
    process.exit(1);
  }

  regenerateChapterFromConvex(bookPath, chapterNumber).then((result) => {
    if (result.success) {
      console.log("✅ Chapter regeneration complete");
    } else {
      console.error(`❌ Failed: ${result.error}`);
    }
    process.exit(result.success ? 0 : 1);
  });
}
