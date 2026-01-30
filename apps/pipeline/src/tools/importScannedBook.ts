/**
 * Scanned Book Import Script
 *
 * Imports a scanned book (processed via iOS companion + pipeline) into Convex CMS.
 * Generates HTML chapters, graphical style, and character avatars.
 *
 * Usage:
 *   bun run src/tools/importScannedBook.ts <book-slug> <session-id> [options]
 *
 * Options:
 *   --title "Book Title"     - Set book title (default: derived from slug)
 *   --author "Author Name"   - Set author name (default: "Unknown")
 *   --generate-avatars       - Generate character avatars with OpenAI
 *   --skip-style             - Skip graphical style generation
 *
 * Examples:
 *   bun run src/tools/importScannedBook.ts right-stuff 9fa71fd6-... --title "The Right Stuff" --author "Tom Wolfe" --generate-avatars
 */

import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { convex, type AvatarState } from "../server/convex-client";
import { callGeminiWrapper } from "../callClaude";
import { callGeminiWithThinkingAndSchemaAndParsed } from "../callFastGemini";
import type { ChapterDetectionResult } from "../scan-server/chapterDetector";
import type { BookAnalysis, BookCharacter } from "../scan-server/ocrSchema";
import { generateBookHtml, type GeneratedChapterHtml } from "../scan-server/htmlGenerator";
import { generateCharacterImageWithOpenAI } from "./new-tooling/generate-pictures-for-entities";
import "dotenv/config";

const SCANNED_BOOKS_DIR = path.resolve(__dirname, "../../scanned-books");

// ===== Types =====

interface ImportArgs {
  bookSlug: string;
  sessionId: string;
  title: string;
  author: string;
  generateAvatars: boolean;
  skipStyle: boolean;
}

interface GraphicalStyle {
  backgroundStyle: string;
  periodStyle: string;
  avatarStyle: string;
}

interface CharacterVisualPrompt {
  name: string;
  visualGuide: string;
}

// ===== Argument Parsing =====

function parseArgs(): ImportArgs {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(`
Usage: bun run src/tools/importScannedBook.ts <book-slug> <session-id> [options]

Options:
  --title "Book Title"     Set book title (default: derived from slug)
  --author "Author Name"   Set author name (default: "Unknown")
  --generate-avatars       Generate character avatars with OpenAI
  --skip-style             Skip graphical style generation

Example:
  bun run src/tools/importScannedBook.ts right-stuff 9fa71fd6-... \\
    --title "The Right Stuff" --author "Tom Wolfe" --generate-avatars
`);
    process.exit(1);
  }

  const bookSlug = args[0];
  const sessionId = args[1];
  let title = bookSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  let author = "Unknown";
  let generateAvatars = false;
  let skipStyle = false;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--title" && args[i + 1]) {
      title = args[i + 1];
      i++;
    } else if (args[i] === "--author" && args[i + 1]) {
      author = args[i + 1];
      i++;
    } else if (args[i] === "--generate-avatars") {
      generateAvatars = true;
    } else if (args[i] === "--skip-style") {
      skipStyle = true;
    }
  }

  return { bookSlug, sessionId, title, author, generateAvatars, skipStyle };
}

// ===== Session Data Loading =====

function loadSessionData(
  bookSlug: string,
  sessionId: string,
): { chapters: ChapterDetectionResult; analysis: BookAnalysis } {
  const sessionDir = path.join(SCANNED_BOOKS_DIR, bookSlug, `session-${sessionId}`);

  const chaptersPath = path.join(sessionDir, "chapters.json");
  const analysisPath = path.join(sessionDir, "analysis.json");

  if (!fs.existsSync(chaptersPath)) {
    throw new Error(`Chapters file not found: ${chaptersPath}`);
  }
  if (!fs.existsSync(analysisPath)) {
    throw new Error(`Analysis file not found: ${analysisPath}`);
  }

  const chapters = JSON.parse(fs.readFileSync(chaptersPath, "utf-8")) as ChapterDetectionResult;
  const analysis = JSON.parse(fs.readFileSync(analysisPath, "utf-8")) as BookAnalysis;

  return { chapters, analysis };
}

// ===== Graphical Style Generation =====

const STYLE_EXAMPLES = `{
  "backgroundStyle": "Digital painting for an ebook background. Soft cinematic-style. Dark psychological noir aesthetic. Cinematic lighting with stark but soft contrasts and heavy shadows. Color palette dominated by muted greys, deep browns, and shadowy blues punctuated by warm highlights.",
  "periodStyle": "Mid-20th Century America",
  "avatarStyle": "Digital painting for an ebook avatar. Soft cinematic-style. Realistic portraits with psychological depth. Cinematic lighting with dramatic shadows. Color palette of muted earth tones with occasional warm highlights."
}`;

async function generateGraphicalStyle(
  bookTitle: string,
  firstChapterText: string,
): Promise<GraphicalStyle> {
  const bookText = firstChapterText.slice(0, 10000);

  const prompt = `Based on the book title "${bookTitle}" and the beginning of the book, create a graphical style for generating images.

<bookText>
${bookText}
</bookText>

Good examples:
${STYLE_EXAMPLES}

IMPORTANT:
- Do not specify any scene elements in backgroundStyle or avatarStyle
- These will be used as prefix prompts for every image separately
- Focus only on style, period, colors, and overall feel
- periodStyle should describe the time period and location of the book's setting

Return format:
{
  "backgroundStyle": "string",
  "periodStyle": "string",
  "avatarStyle": "string"
}`;

  const schema = z.object({
    backgroundStyle: z.string(),
    periodStyle: z.string(),
    avatarStyle: z.string(),
  });

  return (await callGeminiWrapper(prompt, schema, 10)) as GraphicalStyle;
}

// ===== Character Visual Prompts =====

const CharactersSchema = z.object({
  characters: z.array(z.object({ name: z.string(), visualGuide: z.string() })),
});

async function generateCharacterVisualPrompts(
  characters: BookCharacter[],
  firstChapterText: string,
): Promise<CharacterVisualPrompt[]> {
  const characterNames = characters.map((c) => c.name);
  const charactersXml = characters
    .map((c) => `<character name="${c.name}" description="${c.referenceCard}"/>`)
    .join("\n");

  const prompt = `You are creating visual descriptions for character portraits in an ebook.

<characters>
${charactersXml}
</characters>

<bookText>
${firstChapterText.slice(0, 8000)}
</bookText>

For each character, create a detailed visual description suitable for AI image generation.
Focus on:
- Physical appearance (age, build, hair, eyes, skin tone)
- Clothing and accessories appropriate to the period
- Expression and demeanor

Return a visualGuide for each character name listed.`;

  const response = await callGeminiWithThinkingAndSchemaAndParsed(prompt, CharactersSchema);

  // Filter to only include characters we asked for
  return response.characters.filter((c) => characterNames.includes(c.name));
}

// ===== Import Steps =====

async function step1_CreateFolderStructure(
  bookPath: string,
  title: string,
  author: string,
): Promise<void> {
  console.log("\n=== Step 1: Create Folder Structure ===");

  await convex.ensureBookStructure({
    jobId: `scanned-import-${Date.now()}`,
    bookSlug: bookPath.replace("books/", ""),
    metadata: { title, author, language: "en", form: "Prose" },
  });

  console.log(`  Created book structure: ${bookPath}`);
  console.log(`  Title: "${title}" by ${author}`);
}

async function step2_GenerateGraphicalStyle(
  bookPath: string,
  title: string,
  chapterDetection: ChapterDetectionResult,
  skipStyle: boolean,
): Promise<GraphicalStyle | null> {
  console.log("\n=== Step 2: Generate Graphical Style ===");

  if (skipStyle) {
    console.log("  Skipping style generation (--skip-style)");
    return null;
  }

  // Get first chapter text for style analysis
  const firstChapter = chapterDetection.chapters.find((c) => c.chapterNumber > 0);
  if (!firstChapter) {
    console.log("  No chapters found, using default style");
    return null;
  }

  const firstChapterText = firstChapter.pages.map((p) => p.text).join("\n\n");

  console.log("  Generating graphical style from first chapter...");
  const style = await generateGraphicalStyle(title, firstChapterText);

  await convex.updateGraphicalStyle({
    bookPath,
    backgroundStyle: style.backgroundStyle,
    periodStyle: style.periodStyle,
    avatarStyle: style.avatarStyle,
  });

  console.log(`  Period: ${style.periodStyle}`);
  console.log(`  Avatar style: ${style.avatarStyle.slice(0, 80)}...`);

  return style;
}

async function step3_ImportCharacters(
  bookPath: string,
  characters: BookCharacter[],
  firstChapterText: string,
  style: GraphicalStyle | null,
  generateAvatars: boolean,
  outputDir: string,
): Promise<number> {
  console.log("\n=== Step 3: Import Characters ===");
  console.log(`  Found ${characters.length} characters`);

  const avatarStyle =
    style?.avatarStyle ||
    `Digital painting for an ebook avatar. Soft cinematic-style. Realistic with dramatic lighting.`;

  // Step 3a: Generate visual prompts for ALL characters first (if generating avatars)
  const visualPrompts: Map<string, string> = new Map();
  if (generateAvatars) {
    console.log("  Generating visual prompts for all characters...");
    const prompts = await generateCharacterVisualPrompts(characters, firstChapterText);
    for (const p of prompts) {
      visualPrompts.set(p.name, p.visualGuide);
    }
    console.log(`  Generated ${visualPrompts.size} visual prompts`);

    // Save prompts for reference
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const promptsPath = path.join(outputDir, "generated-prompts.json");
    fs.writeFileSync(promptsPath, JSON.stringify(prompts, null, 2));
  }

  // Step 3b: Create all character folders in Convex (in parallel)
  console.log("  Creating character folders in Convex...");
  await Promise.all(
    characters.map((char) =>
      convex.ensureCharacterFolder({
        bookPath,
        characterSlug: char.slug,
        displayName: char.name,
        summary: char.referenceCard,
        aiPrompt: visualPrompts.get(char.name),
      }),
    ),
  );
  console.log(`  Created ${characters.length} character folders`);

  // Step 3c: Generate and upload avatar images in parallel (each uploads as soon as ready)
  if (generateAvatars) {
    console.log(`  Generating ${visualPrompts.size} avatar images in parallel...`);

    let successCount = 0;
    let failCount = 0;

    // Generate + upload each character in parallel (uploads happen as each completes)
    await Promise.all(
      characters
        .filter((char) => visualPrompts.has(char.name))
        .map(async (char) => {
          const characterPath = `${bookPath}/characters/${char.slug}`;
          const visualGuide = visualPrompts.get(char.name)!;

          // Mark as generating
          await convex.markCharacterAvatarState({
            characterPath,
            state: "generating" as AvatarState,
          });

          console.log(`    Generating: ${char.name}`);

          try {
            // Generate image
            const imageBuffer = await generateCharacterImageWithOpenAI(
              visualGuide,
              char.name,
              avatarStyle,
            );

            if (!imageBuffer) {
              failCount++;
              console.log(`    Failed: ${char.name} (no image returned)`);
              await convex.markCharacterAvatarState({
                characterPath,
                state: "error" as AvatarState,
              });
              return;
            }

            // Upload immediately when ready
            await convex.uploadFile({
              folderPath: characterPath,
              basename: "avatar-large.png",
              content: imageBuffer,
              contentType: "image/png",
            });

            await convex.markCharacterAvatarState({ characterPath, state: "ready" as AvatarState });

            successCount++;
            console.log(`    Done: ${char.name}`);
          } catch (error) {
            failCount++;
            console.error(`    Error: ${char.name}:`, error);
            await convex.markCharacterAvatarState({ characterPath, state: "error" as AvatarState });
          }
        }),
    );

    console.log(`  Avatars complete: ${successCount} successful, ${failCount} failed`);
  }

  return characters.length;
}

async function step4_ImportChapters(
  bookPath: string,
  chapters: GeneratedChapterHtml[],
): Promise<number> {
  console.log("\n=== Step 4: Import Chapters ===");
  console.log(`  Importing ${chapters.length} chapters`);

  for (const chapter of chapters) {
    console.log(
      `  Chapter ${chapter.chapterNumber}: ${chapter.title || "(no title)"} (${chapter.paragraphCount} paragraphs)`,
    );

    // Upload HTML content
    const folderPath = `${bookPath}/chapters-source`;
    const basename = `chapter-${chapter.chapterNumber}.html`;

    await convex.uploadFile({
      folderPath,
      basename,
      content: Buffer.from(chapter.html, "utf-8"),
      contentType: "text/html",
    });

    // Update chapter metadata
    await convex.updateChapterMetadata({
      bookPath,
      folderPath,
      basename,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title || undefined,
      sourceFormat: "HTML",
    });
  }

  return chapters.length;
}

async function step5_ImportChapterSummaries(
  bookPath: string,
  analysis: BookAnalysis,
): Promise<number> {
  console.log("\n=== Step 5: Import Character Chapter Summaries ===");

  // Track first appearances for each character
  const firstAppearance: Map<string, number> = new Map();
  for (const char of analysis.allCharacters) {
    firstAppearance.set(char.slug, char.firstSeenChapter);
  }

  let summaryCount = 0;

  // Process each chapter's characters
  for (const chapter of analysis.chapters) {
    if (chapter.chapterNumber === 0) continue; // Skip prologue/front matter

    for (const char of chapter.characters) {
      const isFirst = firstAppearance.get(char.slug) === chapter.chapterNumber;

      // ALWAYS store the chapterAction (what they do in this chapter)
      // The global bio is in character.globalSummary, shown by iOS for first appearance
      const summary = char.chapterAction || char.referenceCard; // Fallback for old analysis format

      await convex.upsertCharacterChapterSummary({
        bookPath,
        characterSlug: char.slug,
        chapterNumber: chapter.chapterNumber,
        summary,
        isFirstAppearance: isFirst,
      });

      summaryCount++;
    }
  }

  console.log(`  Imported ${summaryCount} character-chapter summaries`);
  return summaryCount;
}

async function step6_SaveLocalFiles(
  bookSlug: string,
  sessionId: string,
  chapters: GeneratedChapterHtml[],
  style: GraphicalStyle | null,
): Promise<void> {
  console.log("\n=== Step 6: Save Local Files ===");

  const outputDir = path.join(SCANNED_BOOKS_DIR, bookSlug, `session-${sessionId}`, "output");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save HTML chapters
  const htmlDir = path.join(outputDir, "html");
  if (!fs.existsSync(htmlDir)) {
    fs.mkdirSync(htmlDir, { recursive: true });
  }

  for (const chapter of chapters) {
    const filename = `chapter-${chapter.chapterNumber}.html`;
    fs.writeFileSync(path.join(htmlDir, filename), chapter.html);
  }
  console.log(`  Saved ${chapters.length} HTML files to: ${htmlDir}`);

  // Save graphical style
  if (style) {
    const stylePath = path.join(outputDir, "graphicalStyle.json");
    fs.writeFileSync(stylePath, JSON.stringify(style, null, 2));
    console.log(`  Saved graphical style to: ${stylePath}`);
  }
}

// ===== Exported Function =====

export interface ImportOptions {
  bookSlug: string;
  sessionId: string;
  title?: string;
  author?: string;
  generateAvatars?: boolean;
  skipStyle?: boolean;
  // Pre-loaded data (optional - will load from files if not provided)
  chapterDetection?: ChapterDetectionResult;
  analysis?: BookAnalysis;
}

export interface ImportResult {
  characterCount: number;
  chapterCount: number;
  summaryCount: number;
  avatarsGenerated: boolean;
}

/**
 * Import a scanned book to Convex.
 * Can be called programmatically or via CLI.
 */
export async function importScannedBook(options: ImportOptions): Promise<ImportResult> {
  const {
    bookSlug,
    sessionId,
    title = bookSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    author = "Unknown",
    generateAvatars = false,
    skipStyle = false,
  } = options;

  const bookPath = `books/${bookSlug}`;

  console.log(`\n=== Scanned Book Import ===`);
  console.log(`  Book slug: ${bookSlug}`);
  console.log(`  Session: ${sessionId}`);
  console.log(`  Title: "${title}"`);
  console.log(`  Author: ${author}`);
  console.log(`  Generate avatars: ${generateAvatars}`);
  console.log(`  Skip style: ${skipStyle}`);

  // Load session data (use provided or load from files)
  console.log("\n=== Loading Session Data ===");
  let chapterDetection = options.chapterDetection;
  let analysis = options.analysis;

  if (!chapterDetection || !analysis) {
    const loaded = loadSessionData(bookSlug, sessionId);
    chapterDetection = chapterDetection || loaded.chapters;
    analysis = analysis || loaded.analysis;
  }

  console.log(`  Loaded ${chapterDetection.chapters.length} chapters`);
  console.log(`  Loaded ${analysis.allCharacters.length} characters`);

  // Generate HTML
  console.log("\n=== Generating HTML ===");
  const htmlChapters = generateBookHtml(chapterDetection, analysis);
  console.log(`  Generated ${htmlChapters.length} HTML chapters`);

  // Get first chapter text for various analyses
  const firstChapter = chapterDetection.chapters.find((c) => c.chapterNumber > 0);
  const firstChapterText = firstChapter?.pages.map((p) => p.text).join("\n\n") || "";

  // Output directory for local files
  const outputDir = path.join(SCANNED_BOOKS_DIR, bookSlug, `session-${sessionId}`, "output");

  // Run import steps
  await step1_CreateFolderStructure(bookPath, title, author);
  const style = await step2_GenerateGraphicalStyle(bookPath, title, chapterDetection, skipStyle);
  const characterCount = await step3_ImportCharacters(
    bookPath,
    analysis.allCharacters,
    firstChapterText,
    style,
    generateAvatars,
    outputDir,
  );
  const chapterCount = await step4_ImportChapters(bookPath, htmlChapters);
  const summaryCount = await step5_ImportChapterSummaries(bookPath, analysis);
  await step6_SaveLocalFiles(bookSlug, sessionId, htmlChapters, style);

  // Mark as completed
  await convex.markCompleted(bookPath);

  console.log("\n=== Import Complete ===");
  console.log(`  Characters: ${characterCount}`);
  console.log(`  Chapters: ${chapterCount}`);
  console.log(`  Chapter summaries: ${summaryCount}`);
  console.log(`  Avatars generated: ${generateAvatars}`);

  return { characterCount, chapterCount, summaryCount, avatarsGenerated: generateAvatars };
}

// ===== CLI Main =====

async function main() {
  const { bookSlug, sessionId, title, author, generateAvatars, skipStyle } = parseArgs();

  const result = await importScannedBook({
    bookSlug,
    sessionId,
    title,
    author,
    generateAvatars,
    skipStyle,
  });

  console.log(`\nNext steps:`);
  console.log(`  1. Review in CMS`);
  if (!result.avatarsGenerated) {
    console.log(`  2. Generate character avatars (re-run with --generate-avatars)`);
    console.log(`  3. Test in player: bun run dev:player`);
  } else {
    console.log(`  2. Test in player: bun run dev:player`);
  }
}

// Only run CLI if this is the entry point (not imported as a module)
if (import.meta.main) {
  main().catch((error) => {
    console.error("\nImport failed:", error);
    process.exit(1);
  });
}
