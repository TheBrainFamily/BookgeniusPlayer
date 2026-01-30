#!/usr/bin/env bun
/**
 * Clone a processed book to a new slug.
 *
 * Copies all metadata, chapters, embeddings, and character data.
 * Does NOT copy graphics (avatars, backgrounds) - use regenerate-all-graphics.ts for that.
 *
 * Usage:
 *   bun clone-book.ts <source-slug> <target-slug>
 *
 * Example:
 *   bun clone-book.ts arthur-conan-doyle_a-study-in-scarlet arthur-conan-doyle_a-study-in-scarlet-openai
 */

import path from "path";
import fs from "fs-extra";
import { convex, getCharacterFolders, getChapterXml } from "./convex-client";
import { uploadBookFolder } from "./upload-books-to-r2";
import { AdminConvexHttpClient } from "../lib/AdminConvexHttpClient";
import { api } from "@bookgenius/convex/_generated/api";
import "dotenv/config";
import { v4 as uuidv4 } from "uuid";

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error("Missing CONVEX_URL environment variable");
}
const client = new AdminConvexHttpClient(CONVEX_URL);

interface CloneResult {
  success: boolean;
  sourceSlug: string;
  targetSlug: string;
  error?: string;
}

async function cloneBook(sourceSlug: string, targetSlug: string): Promise<CloneResult> {
  const repoRoot = path.resolve(__dirname, "../../");
  const sourceDir = path.join(repoRoot, "books-data", sourceSlug);
  const targetDir = path.join(repoRoot, "books-data", targetSlug);
  const sourceBookPath = `books/${sourceSlug}`;
  const targetBookPath = `books/${targetSlug}`;

  console.log(`\n📚 Cloning book: ${sourceSlug} → ${targetSlug}\n`);

  // Phase 1: Validate
  console.log("Phase 1: Validating...");

  if (!(await fs.pathExists(sourceDir))) {
    return {
      success: false,
      sourceSlug,
      targetSlug,
      error: `Source directory not found: ${sourceDir}`,
    };
  }

  const sourceBook = await client.query(api.metadata.getBookMetadata, { bookPath: sourceBookPath });
  if (!sourceBook) {
    return {
      success: false,
      sourceSlug,
      targetSlug,
      error: `Source book not found in Convex: ${sourceBookPath}`,
    };
  }

  if (await fs.pathExists(targetDir)) {
    return {
      success: false,
      sourceSlug,
      targetSlug,
      error: `Target directory already exists: ${targetDir}`,
    };
  }

  const targetBook = await client.query(api.metadata.getBookMetadata, { bookPath: targetBookPath });
  if (targetBook) {
    return {
      success: false,
      sourceSlug,
      targetSlug,
      error: `Target book already exists in Convex: ${targetBookPath}`,
    };
  }

  console.log("  ✅ Validation passed\n");

  // Phase 2: Clone local files
  console.log("Phase 2: Cloning local files...");

  await fs.ensureDir(targetDir);

  // Copy input directory
  const inputSrc = path.join(sourceDir, "input");
  const inputDst = path.join(targetDir, "input");
  if (await fs.pathExists(inputSrc)) {
    await fs.copy(inputSrc, inputDst);
    console.log("  ✅ Copied input/");
  }

  // Copy temporary-output directory
  const tempSrc = path.join(sourceDir, "temporary-output");
  const tempDst = path.join(targetDir, "temporary-output");
  if (await fs.pathExists(tempSrc)) {
    await fs.copy(tempSrc, tempDst);
    console.log("  ✅ Copied temporary-output/");
  }

  // Create empty output directories
  await fs.ensureDir(path.join(targetDir, "output", "characters"));
  await fs.ensureDir(path.join(targetDir, "output", "backgrounds"));
  await fs.ensureDir(path.join(targetDir, "output", "style-previews"));
  console.log("  ✅ Created empty output directories\n");

  // Phase 3: Clone Convex metadata
  console.log("Phase 3: Cloning Convex metadata...");

  // Get source book's settings from local file for chapter count
  const settingsPath = path.join(tempDst, "bookSettings.json");
  let totalChapters: number | undefined;
  if (await fs.pathExists(settingsPath)) {
    const settings = await fs.readJson(settingsPath);
    totalChapters = settings.numberOfChaptersIdentified;
  }

  // Create book structure in Convex
  await convex.ensureBookStructure({
    jobId: uuidv4(),
    bookSlug: targetSlug,
    metadata: {
      title: sourceBook.title,
      author: sourceBook.author,
      language: sourceBook.language,
      form: sourceBook.form,
    },
    totalChapters,
  });
  console.log("  ✅ Created book structure");

  // Copy graphical styles
  await convex.updateGraphicalStyle({
    bookPath: targetBookPath,
    backgroundStyle: sourceBook.backgroundStyle ?? undefined,
    periodStyle: sourceBook.periodStyle ?? undefined,
    avatarStyle: sourceBook.avatarStyle ?? undefined,
  });
  console.log("  ✅ Copied graphical styles");

  // Clone characters
  const sourceCharacters = await getCharacterFolders(sourceBookPath);
  console.log(`  📋 Cloning ${sourceCharacters.length} characters...`);

  for (const char of sourceCharacters) {
    await convex.ensureCharacterFolder({
      bookPath: targetBookPath,
      characterSlug: char.slug,
      displayName: char.displayName,
      summary: char.summary,
      aiPrompt: char.aiPrompt,
    });
  }
  console.log(`  ✅ Cloned ${sourceCharacters.length} characters\n`);

  // Phase 4: Upload chapters to new book path
  console.log("Phase 4: Uploading chapters...");

  const chapterCount = totalChapters || 0;
  let uploadedChapters = 0;

  for (let i = 1; i <= chapterCount; i++) {
    // Try to get chapter from local file first
    const localChapterPath = path.join(tempDst, `rewritten-paragraphs-for-chapter-${i}.xml`);

    let chapterContent: string | null = null;
    if (await fs.pathExists(localChapterPath)) {
      chapterContent = await fs.readFile(localChapterPath, "utf-8");
    } else {
      // Fall back to fetching from source Convex
      chapterContent = await getChapterXml(sourceBookPath, i);
    }

    if (chapterContent) {
      const basename = `chapter-${i}.html`;

      await convex.uploadFile({
        folderPath: `${targetBookPath}/chapters-source`,
        basename,
        content: Buffer.from(chapterContent, "utf-8"),
        contentType: "text/html",
      });

      // Update chapter metadata
      await convex.updateChapterMetadata({
        bookPath: targetBookPath,
        folderPath: `${targetBookPath}/chapters-source`,
        basename,
        chapterNumber: i,
        sourceFormat: "html",
      });

      uploadedChapters++;
    }
  }
  console.log(`  ✅ Uploaded ${uploadedChapters} chapters\n`);

  // Phase 5: Upload to R2
  console.log("Phase 5: Uploading to R2...");

  const r2Result = await uploadBookFolder(targetDir, targetSlug);
  if (r2Result.success) {
    console.log("  ✅ Uploaded embeddings and rich.xml to R2\n");
  } else {
    console.log(`  ⚠️  R2 upload failed: ${r2Result.error}\n`);
  }

  // Mark book as completed
  await convex.markCompleted(targetBookPath);

  console.log("═".repeat(50));
  console.log(`✅ Book cloned successfully!`);
  console.log(`   Source: ${sourceSlug}`);
  console.log(`   Target: ${targetSlug}`);
  console.log(`\nNext step: Regenerate graphics with:`);
  console.log(
    `   bun apps/pipeline/src/server/regenerate-all-graphics.ts ${targetSlug} --provider openai`,
  );
  console.log("═".repeat(50));

  return { success: true, sourceSlug, targetSlug };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage:
  bun clone-book.ts <source-slug> <target-slug>

Example:
  bun clone-book.ts arthur-conan-doyle_a-study-in-scarlet arthur-conan-doyle_a-study-in-scarlet-openai

Description:
  Clones a processed book to a new slug, copying all metadata, chapters,
  embeddings, and character data. Does NOT copy graphics - run
  regenerate-all-graphics.ts separately to generate new images.
`);
    process.exit(1);
  }

  const [sourceSlug, targetSlug] = args;

  try {
    const result = await cloneBook(sourceSlug, targetSlug);
    if (!result.success) {
      console.error(`\n❌ Clone failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Clone failed:`, error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}

export { cloneBook };
