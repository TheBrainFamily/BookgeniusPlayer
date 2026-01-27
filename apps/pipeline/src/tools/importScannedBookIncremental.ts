/**
 * importScannedBookIncremental.ts - Incremental chapter import for real-time processing
 *
 * Imports a single chapter at a time to Convex as it becomes available,
 * enabling real-time updates as the user scans.
 */

import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { convex, getCharacterFolders, type AvatarState } from "../server/convex-client";
import { callGeminiWrapper } from "../callClaude";
import { callGeminiWithThinkingAndSchemaAndParsed } from "../callFastGemini";
import type { DetectedChapter } from "../scan-server/chapterDetector";
import type { ChapterAnalysis, BookCharacter } from "../scan-server/ocrSchema";
import { generateChapterHtml } from "../scan-server/htmlGenerator";
import { generateCharacterImageWithOpenAI } from "./new-tooling/generate-pictures-for-entities";

const SCANNED_BOOKS_DIR = path.resolve(__dirname, "../../scanned-books");

// ===== Types =====

export interface IncrementalImportOptions {
  bookSlug: string;
  sessionId: string;
  bookTitle?: string;
  chapter: DetectedChapter;
  analysis: ChapterAnalysis;
  allCharacters: BookCharacter[]; // Current global character list
  generateAvatars?: boolean;
}

interface GraphicalStyle {
  backgroundStyle: string;
  periodStyle: string;
  avatarStyle: string;
}

// Track which books have been initialized (in-memory cache)
const initializedBooks = new Set<string>();

// Track characters that already have avatars being generated (to avoid duplicates)
const avatarsInProgress = new Set<string>();

// Track characters that already HAVE avatars (completed generation)
const avatarsCompleted = new Set<string>();

// ===== Graphical Style =====

const STYLE_EXAMPLES = `{
  "backgroundStyle": "Digital painting for an ebook background. Soft cinematic-style. Dark psychological noir aesthetic.",
  "periodStyle": "Mid-20th Century America",
  "avatarStyle": "Digital painting for an ebook avatar. Soft cinematic-style. Realistic portraits with psychological depth."
}`;

async function generateGraphicalStyle(
  bookTitle: string,
  chapterText: string,
): Promise<GraphicalStyle> {
  const bookText = chapterText.slice(0, 10000);

  const prompt = `Based on the book title "${bookTitle}" and the beginning of the book, create a graphical style for generating images.

<bookText>
${bookText}
</bookText>

Good examples:
${STYLE_EXAMPLES}

IMPORTANT:
- Do not specify any scene elements in backgroundStyle or avatarStyle
- Focus only on style, period, colors, and overall feel
- periodStyle should describe the time period and location

Return JSON with backgroundStyle, periodStyle, avatarStyle.`;

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
  chapterText: string,
): Promise<Map<string, string>> {
  const characterNames = characters.map((c) => c.name);
  const charactersXml = characters
    .map((c) => `<character name="${c.name}" description="${c.referenceCard}"/>`)
    .join("\n");

  const prompt = `You are creating visual descriptions for character portraits in an ebook.

<characters>
${charactersXml}
</characters>

<bookText>
${chapterText.slice(0, 8000)}
</bookText>

For each character, create a detailed visual description suitable for AI image generation.
Focus on physical appearance, clothing, expression, and demeanor.`;

  const response = await callGeminiWithThinkingAndSchemaAndParsed(prompt, CharactersSchema);

  const prompts = new Map<string, string>();
  for (const c of response.characters) {
    if (characterNames.includes(c.name)) {
      prompts.set(c.name, c.visualGuide);
    }
  }
  return prompts;
}

// ===== Book Initialization =====

async function ensureBookInitialized(
  bookSlug: string,
  bookTitle: string,
  chapterText: string,
): Promise<GraphicalStyle | null> {
  const bookPath = `books/${bookSlug}`;

  if (initializedBooks.has(bookSlug)) {
    return null; // Already initialized this session
  }

  console.log(`[IncrementalImport] Initializing book: ${bookSlug}`);

  // Create book structure
  await convex.ensureBookStructure({
    jobId: `scanned-import-${Date.now()}`,
    bookSlug,
    metadata: { title: bookTitle, author: "Unknown", language: "en", form: "Prose" },
  });

  // Generate graphical style
  let style: GraphicalStyle | null = null;
  try {
    style = await generateGraphicalStyle(bookTitle, chapterText);
    await convex.updateGraphicalStyle({
      bookPath,
      backgroundStyle: style.backgroundStyle,
      periodStyle: style.periodStyle,
      avatarStyle: style.avatarStyle,
    });
    console.log(`[IncrementalImport] Generated graphical style: ${style.periodStyle}`);
  } catch (error) {
    console.error(`[IncrementalImport] Failed to generate style:`, error);
  }

  initializedBooks.add(bookSlug);
  return style;
}

// ===== Character Import =====

async function importNewCharacters(
  bookPath: string,
  characters: BookCharacter[],
  chapterText: string,
  generateAvatars: boolean,
): Promise<void> {
  // Filter to characters that need to be created (not already in Convex)
  // For simplicity, we create/update all - Convex will handle idempotency
  if (characters.length === 0) return;

  console.log(`[IncrementalImport] Upserting ${characters.length} characters`);

  // Generate visual prompts for avatar generation
  let visualPrompts = new Map<string, string>();
  if (generateAvatars) {
    // Check Convex for existing avatar states to avoid regenerating prompts
    const existingCharacters = await getCharacterFolders(bookPath);
    const existingAvatarStates = new Map<string, string>();
    for (const char of existingCharacters) {
      existingAvatarStates.set(char.slug, char.avatarGenerationState ?? "none");
    }

    // Only generate prompts for characters that don't already have avatars
    const newForAvatars = characters.filter((c) => {
      const convexState = existingAvatarStates.get(c.slug);
      if (convexState === "ready" || convexState === "generating") return false;
      if (avatarsInProgress.has(`${bookPath}/${c.slug}`)) return false;
      return true;
    });

    if (newForAvatars.length > 0) {
      visualPrompts = await generateCharacterVisualPrompts(newForAvatars, chapterText);
    }
  }

  // Create character folders
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

  // Generate avatars for new characters (in background)
  if (generateAvatars && visualPrompts.size > 0) {
    // Fire-and-forget avatar generation
    generateAvatarsForCharacters(bookPath, characters, visualPrompts).catch((err) => {
      console.error(`[IncrementalImport] Avatar generation failed:`, err);
    });
  }
}

async function generateAvatarsForCharacters(
  bookPath: string,
  characters: BookCharacter[],
  visualPrompts: Map<string, string>,
): Promise<void> {
  const avatarStyle = `Digital painting for an ebook avatar. Soft cinematic-style. Realistic with dramatic lighting.`;

  // Fetch existing characters from Convex to check avatar state
  // This survives server restarts (unlike the in-memory sets)
  const existingCharacters = await getCharacterFolders(bookPath);
  const existingAvatarStates = new Map<string, string>();
  for (const char of existingCharacters) {
    existingAvatarStates.set(char.slug, char.avatarGenerationState ?? "none");
  }

  // Filter characters that need avatars and don't already have one
  const charactersToGenerate = characters.filter((char) => {
    const visualGuide = visualPrompts.get(char.name);
    if (!visualGuide) return false;

    const avatarKey = `${bookPath}/${char.slug}`;

    // Check Convex state first (persisted) - skip if ready or currently generating
    const convexState = existingAvatarStates.get(char.slug);
    if (convexState === "ready" || convexState === "generating") {
      console.log(
        `[IncrementalImport] Skipping avatar for ${char.name} - already ${convexState} in Convex`,
      );
      return false;
    }

    // Also check in-memory cache (for current session)
    if (avatarsCompleted.has(avatarKey) || avatarsInProgress.has(avatarKey)) return false;

    avatarsInProgress.add(avatarKey);
    return true;
  });

  if (charactersToGenerate.length === 0) return;

  console.log(
    `[IncrementalImport] Generating ${charactersToGenerate.length} avatars in parallel...`,
  );

  // Generate all avatars in parallel (like the original implementation)
  await Promise.all(
    charactersToGenerate.map(async (char) => {
      const characterPath = `${bookPath}/characters/${char.slug}`;
      const avatarKey = `${bookPath}/${char.slug}`;
      const visualGuide = visualPrompts.get(char.name)!;

      try {
        await convex.markCharacterAvatarState({
          characterPath,
          state: "generating" as AvatarState,
        });

        console.log(`[IncrementalImport] Generating avatar: ${char.name}`);
        const imageBuffer = await generateCharacterImageWithOpenAI(
          visualGuide,
          char.name,
          avatarStyle,
        );

        if (imageBuffer) {
          // Mark as completed FIRST to prevent any race condition
          avatarsCompleted.add(avatarKey);
          await convex.uploadFile({
            folderPath: characterPath,
            basename: "avatar-large.png",
            content: imageBuffer,
            contentType: "image/png",
          });
          await convex.markCharacterAvatarState({ characterPath, state: "ready" as AvatarState });
          console.log(`[IncrementalImport] Avatar ready: ${char.name}`);
        } else {
          await convex.markCharacterAvatarState({ characterPath, state: "error" as AvatarState });
        }
      } catch (error) {
        console.error(`[IncrementalImport] Avatar failed for ${char.name}:`, error);
        // Remove from completed on error so it can be retried
        avatarsCompleted.delete(avatarKey);
        await convex.markCharacterAvatarState({ characterPath, state: "error" as AvatarState });
      } finally {
        avatarsInProgress.delete(avatarKey);
      }
    }),
  );

  console.log(`[IncrementalImport] Avatar generation complete`);
}

// ===== Chapter Import =====

async function importChapter(
  bookPath: string,
  chapter: DetectedChapter,
  analysis: ChapterAnalysis,
): Promise<void> {
  console.log(`[IncrementalImport] Importing chapter ${chapter.chapterNumber}`);

  // Generate HTML for this chapter
  const generated = generateChapterHtml(chapter, analysis);

  // Upload HTML
  const folderPath = `${bookPath}/chapters-source`;
  const basename = `chapter-${chapter.chapterNumber}.html`;

  await convex.uploadFile({
    folderPath,
    basename,
    content: Buffer.from(generated.html, "utf-8"),
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

  console.log(`[IncrementalImport] Chapter ${chapter.chapterNumber} imported`);
}

// ===== Character Chapter Summaries =====

async function importChapterSummaries(
  bookPath: string,
  chapterNumber: number,
  analysis: ChapterAnalysis,
  allCharacters: BookCharacter[],
): Promise<void> {
  if (analysis.characters.length === 0) return;

  // Build first appearance map
  const firstAppearance = new Map<string, number>();
  for (const char of allCharacters) {
    firstAppearance.set(char.slug, char.firstSeenChapter);
  }

  // Import all summaries in parallel
  await Promise.all(
    analysis.characters.map((char) => {
      const isFirst = firstAppearance.get(char.slug) === chapterNumber;
      const summary = char.chapterAction || char.referenceCard;

      return convex.upsertCharacterChapterSummary({
        bookPath,
        characterSlug: char.slug,
        chapterNumber,
        summary,
        isFirstAppearance: isFirst,
      });
    }),
  );

  console.log(
    `[IncrementalImport] Imported ${analysis.characters.length} character summaries for chapter ${chapterNumber}`,
  );
}

// ===== Main Export =====

/**
 * Import a single chapter incrementally to Convex.
 * Called by sessionProcessor as each chapter completes.
 */
export async function importChapterIncremental(options: IncrementalImportOptions): Promise<void> {
  const {
    bookSlug,
    sessionId,
    bookTitle = bookSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    chapter,
    analysis,
    allCharacters,
    generateAvatars = true,
  } = options;

  const bookPath = `books/${bookSlug}`;
  const chapterText = chapter.pages.map((p) => p.text).join("\n\n");

  // Ensure book is initialized (first chapter only)
  await ensureBookInitialized(bookSlug, bookTitle, chapterText);

  // Run independent operations in parallel:
  // - Character folder creation + avatar generation
  // - Chapter HTML upload
  // - Character chapter summaries
  await Promise.all([
    importNewCharacters(bookPath, allCharacters, chapterText, generateAvatars),
    importChapter(bookPath, chapter, analysis),
    importChapterSummaries(bookPath, chapter.chapterNumber, analysis, allCharacters),
  ]);

  // Save local HTML file
  const outputDir = path.join(
    SCANNED_BOOKS_DIR,
    bookSlug,
    `session-${sessionId}`,
    "output",
    "html",
  );
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const localHtml = generateChapterHtml(chapter, analysis);
  fs.writeFileSync(path.join(outputDir, `chapter-${chapter.chapterNumber}.html`), localHtml.html);

  console.log(`[IncrementalImport] Chapter ${chapter.chapterNumber} complete for ${bookSlug}`);
}
