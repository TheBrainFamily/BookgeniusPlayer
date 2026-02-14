import { join } from "path";
import { existsSync, copyFileSync } from "fs";
import { extractChapters } from "./lib/chapter-extractor";
import { CharacterRegistry } from "./lib/character-registry";
import { parseCharactersFromXhtml } from "./lib/xhtml-character-parser";
import { verifyTextInvariance } from "./lib/text-verifier";
import { processChapter } from "./ai-client";
import type { ChapterInfo } from "./types";

const BOOKS_DATA_DIR = join(import.meta.dir, "../../pipeline/books-data");
const WORKSPACE_DIR = join(import.meta.dir, "../workspace");
const MAX_RETRIES = 2;

function buildChapterPrompt(chapter: ChapterInfo, registry: CharacterRegistry): string {
  const lines = [
    `## Chapter ${chapter.chapterNumber}`,
    "",
    `Read and annotate the chapter file at: ${chapter.filePath}`,
    "",
    "### Known Characters",
    "",
    registry.toPromptContext(),
    "",
    "### Instructions",
    "",
    "Process the chapter in ~50-line chunks. Do NOT read the whole file at once.",
    "",
    "1. Read lines 1-50 with `Read` (offset=1, limit=50)",
    "2. Annotate that chunk — add data-speaker, data-c, data-reveals with Edit",
    "3. Read the next ~50 lines (adjust offset for any lines your edits added)",
    "4. Repeat until you reach the end of the file",
    "5. Text verification happens automatically after each edit — no need to re-read for checking",
  ];
  return lines.join("\n");
}

export async function processBook(bookSlug: string): Promise<void> {
  const richXmlPath = join(BOOKS_DATA_DIR, bookSlug, "input", "rich.xml");
  if (!existsSync(richXmlPath)) {
    console.error(`rich.xml not found: ${richXmlPath}`);
    process.exit(1);
  }

  const workspaceDir = join(WORKSPACE_DIR, bookSlug);
  console.log(`\nProcessing: ${bookSlug}`);
  console.log(`Source: ${richXmlPath}`);
  console.log(`Workspace: ${workspaceDir}\n`);

  // 1. Extract chapters
  const chapters = extractChapters(richXmlPath, workspaceDir);

  // 2. Initialize empty in-memory character registry
  const registry = new CharacterRegistry();

  // 3. Process each chapter serially
  for (const chapter of chapters) {
    console.log(`\n--- Chapter ${chapter.chapterNumber} ---`);

    let success = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        console.log(`  Retry ${attempt}/${MAX_RETRIES}...`);
        // Restore from original
        copyFileSync(chapter.originalFilePath, chapter.filePath);
      }

      // Build prompt with known characters context
      const prompt = buildChapterPrompt(chapter, registry);

      // Run agent
      try {
        await processChapter({
          prompt,
          workspaceDir,
          chapterNumber: chapter.chapterNumber,
          originalFilePath: chapter.originalFilePath,
          chapterFilePath: chapter.filePath,
        });
      } catch (error) {
        console.error(`  Agent error:`, error);
        continue;
      }

      // Verify text invariance
      const verified = verifyTextInvariance(chapter.originalFilePath, chapter.filePath);
      if (!verified) {
        console.log(`  Text verification failed for chapter ${chapter.chapterNumber}.`);
        continue;
      }

      success = true;
      break;
    }

    if (!success) {
      console.error(
        `  FAILED chapter ${chapter.chapterNumber} after ${MAX_RETRIES + 1} attempts. Restoring original.`,
      );
      copyFileSync(chapter.originalFilePath, chapter.filePath);
      // Continue to next chapter — don't block the whole book
    }

    // Post-processing: extract characters from edited XHTML
    const parsed = parseCharactersFromXhtml(chapter.filePath, chapter.chapterNumber);

    for (const [slug, { name }] of parsed.characters) {
      if (!registry.has(slug)) {
        registry.registerWithSlug(slug, name, chapter.chapterNumber);
      }
    }

    for (const reveal of parsed.reveals) {
      registry.linkIdentity(reveal);
    }

    console.log(`  Chapter ${chapter.chapterNumber} done. ${registry.size} characters known.`);
  }

  // Final summary
  console.log("\n=== Processing Complete ===");
  console.log(`Book: ${bookSlug}`);
  console.log(`Chapters: ${chapters.length}`);
  console.log(`Characters: ${registry.size}`);
  console.log("\nCharacter list:");
  console.log(JSON.stringify(registry.toJSON(), null, 2));
}
