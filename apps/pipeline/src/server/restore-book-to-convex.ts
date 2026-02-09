#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { DOMParser, type Element as XMLElement } from "@xmldom/xmldom";
import pLimit from "p-limit";
import PQueue from "p-queue";
import { convex } from "./convex-client";
import { computeParagraphCount } from "../lib/paragraphCount";
import { getChapterTitle } from "../tools/new-tooling/get-chapter-title";
import { generateTagName } from "../helpers/generateTagName";
import { withRetry } from "../tools/retry";
import {
  buildCleanedCharacterSummaryMap,
  parseCharacterRoleCleanupResponse,
  resolveCharacterMetadataForUpload,
  type CharacterRoleCleanupResponse,
} from "./character-metadata-cleanup";
import "dotenv/config";

type RestoreOptions = { slug: string; bookDir: string; dryRun: boolean; strict: boolean };

type RestoreStats = {
  chaptersUploaded: number;
  charactersUpserted: number;
  avatarsUploaded: number;
  backgroundsUploaded: number;
  cuesUpserted: number;
  skipped: number;
  failed: number;
};

type SummaryCharacter = { name: string; referenceCard: string };

type SummaryFile = { characters: SummaryCharacter[] };

type GeneratedPromptsFile = { characters: Array<{ name: string; visualGuide: string }> };

type GraphicalStyle = { backgroundStyle?: string; periodStyle?: string; avatarStyle?: string };

type BookSettingsFile = { title?: string; author?: string; language?: string; form?: string };

const AVATAR_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;
const BACKGROUND_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".mp4", ".webm"] as const;
const TASK_CONCURRENCY = Number.parseInt(process.env.RESTORE_TASK_CONCURRENCY || "16", 10);
const API_CONCURRENCY = Number.parseInt(process.env.RESTORE_API_CONCURRENCY || "24", 10);
const RETRY_MAX = Number.parseInt(process.env.RESTORE_RETRY_MAX || "4", 10);
const RETRY_BASE_MS = Number.parseInt(process.env.RESTORE_RETRY_BASE_MS || "250", 10);
const RETRY_MAX_MS = Number.parseInt(process.env.RESTORE_RETRY_MAX_MS || "4000", 10);

const apiQueue = new PQueue({ concurrency: API_CONCURRENCY });

function usage(): void {
  console.log(
    "Usage: bun src/server/restore-book-to-convex.ts <book-slug-or-path> [--dry-run] [--strict]",
  );
  console.log("");
  console.log("Examples:");
  console.log("  bun src/server/restore-book-to-convex.ts mary-shelley_frankenstein");
  console.log(
    "  bun src/server/restore-book-to-convex.ts apps/pipeline/books-data/mary-shelley_frankenstein --dry-run",
  );
}

function humanizeSlug(slug: string): string {
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".html":
      return "text/html";
    default:
      return "application/octet-stream";
  }
}

function resolveBookDir(input: string): { slug: string; bookDir: string } {
  const repoRoot = path.resolve(__dirname, "../../");
  const booksDataRoot = path.join(repoRoot, "books-data");

  if (input.startsWith("~/")) {
    const home = process.env.HOME ?? "";
    const expanded = path.join(home, input.slice(2));
    if (fs.existsSync(expanded) && fs.statSync(expanded).isDirectory()) {
      return { slug: path.basename(expanded), bookDir: expanded };
    }
  }

  const resolvedInput = path.resolve(input);
  if (fs.existsSync(resolvedInput) && fs.statSync(resolvedInput).isDirectory()) {
    return { slug: path.basename(resolvedInput), bookDir: resolvedInput };
  }

  const fromBooksData = path.join(booksDataRoot, input);
  if (fs.existsSync(fromBooksData) && fs.statSync(fromBooksData).isDirectory()) {
    return { slug: path.basename(fromBooksData), bookDir: fromBooksData };
  }

  throw new Error(`Book folder not found for input: ${input}`);
}

function parseArgs(argv: string[]): RestoreOptions {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const input = argv[0];
  const dryRun = argv.includes("--dry-run");
  const strict = argv.includes("--strict");
  const { slug, bookDir } = resolveBookDir(input);

  return { slug, bookDir, dryRun, strict };
}

function requirePathExists(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required ${label}: ${filePath}`);
  }
}

function parseChapterIntoDom(chapter: string): XMLElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(chapter, "text/html");
  return doc.documentElement as XMLElement;
}

function parseSummaryFile(filePath: string): SummaryFile {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  const parsed = raw as Partial<SummaryFile>;
  if (!Array.isArray(parsed.characters)) {
    throw new Error(`Invalid summary file format: ${filePath}`);
  }
  return {
    characters: parsed.characters.map((character) => ({
      name: String(character?.name ?? ""),
      referenceCard: String(character?.referenceCard ?? ""),
    })),
  };
}

function parseGeneratedPromptsFile(filePath: string): GeneratedPromptsFile {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  const parsed = raw as Partial<GeneratedPromptsFile>;
  if (!Array.isArray(parsed.characters)) {
    return { characters: [] };
  }
  return {
    characters: parsed.characters
      .map((character) => ({
        name: String(character?.name ?? "").trim(),
        visualGuide: String(character?.visualGuide ?? ""),
      }))
      .filter((character) => character.name.length > 0),
  };
}

function getCanonicalChapterFiles(
  tempOutputDir: string,
): Array<{ chapter: number; filePath: string }> {
  const files = fs
    .readdirSync(tempOutputDir)
    .map((name) => {
      const match = name.match(/^rewritten-paragraphs-for-chapter-(\d+)\.xml$/);
      if (!match) return null;
      return { chapter: parseInt(match[1], 10), filePath: path.join(tempOutputDir, name) };
    })
    .filter((item): item is { chapter: number; filePath: string } => item !== null)
    .sort((a, b) => a.chapter - b.chapter);

  return files;
}

function getBackgroundFiles(backgroundsDir: string): string[] {
  return fs
    .readdirSync(backgroundsDir)
    .filter((file) =>
      BACKGROUND_EXTENSIONS.includes(
        path.extname(file).toLowerCase() as (typeof BACKGROUND_EXTENSIONS)[number],
      ),
    )
    .sort((a, b) => a.localeCompare(b));
}

function getAvatarFileBySlug(charactersDir: string, slug: string): string | null {
  for (const ext of AVATAR_EXTENSIONS) {
    const candidate = path.join(charactersDir, `${slug}${ext}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function maybeRun(
  dryRun: boolean,
  actionDescription: string,
  action: () => Promise<void>,
): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] ${actionDescription}`);
    return;
  }
  await action();
}

type RetryErrorCandidate = {
  status?: number;
  statusCode?: number;
  message?: string;
  code?: string;
  cause?: { status?: number; statusCode?: number; code?: string };
};

function getRetryStatus(candidate: RetryErrorCandidate): number | undefined {
  return (
    candidate.statusCode ??
    candidate.status ??
    candidate.cause?.statusCode ??
    candidate.cause?.status
  );
}

function hasRetryableCode(candidate: RetryErrorCandidate): boolean {
  const code = String(candidate.code ?? candidate.cause?.code ?? "").toUpperCase();
  return (
    code.includes("ECONN") ||
    code.includes("ETIMEDOUT") ||
    code.includes("EAI_AGAIN") ||
    code.includes("ENOTFOUND")
  );
}

function hasRetryableMessage(candidate: RetryErrorCandidate): boolean {
  const message = String(candidate.message ?? "").toLowerCase();
  const retryablePhrases = [
    "rate limit",
    "too many requests",
    "resource_exhausted",
    "quota exceeded",
    "timed out",
    "timeout",
    "fetch failed",
    "gateway",
    "service unavailable",
  ];
  return retryablePhrases.some((phrase) => message.includes(phrase));
}

function isRetryableError(error: unknown): boolean {
  const candidate = (error || {}) as RetryErrorCandidate;
  const status = getRetryStatus(candidate);
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  if (hasRetryableCode(candidate)) return true;
  return hasRetryableMessage(candidate);
}

async function queueConvexCall<T>(label: string, action: () => Promise<T>): Promise<Awaited<T>> {
  const result = await withRetry(
    async () => {
      return await apiQueue.add(action);
    },
    {
      label: `restore:${label}`,
      maxRetries: RETRY_MAX,
      baseDelayMs: RETRY_BASE_MS,
      maxDelayMs: RETRY_MAX_MS,
      isRetryable: isRetryableError,
    },
  );
  return result as Awaited<T>;
}

function loadBookSettings(settingsPath: string): BookSettingsFile {
  if (!fs.existsSync(settingsPath)) {
    return {};
  }
  const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as unknown;
  const parsed = raw as Partial<BookSettingsFile>;
  return {
    title: parsed.title,
    author: parsed.author,
    language: parsed.language,
    form: parsed.form,
  };
}

function loadGraphicalStyle(stylePath: string): GraphicalStyle | null {
  if (!fs.existsSync(stylePath)) {
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(stylePath, "utf-8")) as unknown;
  const parsed = raw as Partial<GraphicalStyle>;
  return {
    backgroundStyle: parsed.backgroundStyle,
    periodStyle: parsed.periodStyle,
    avatarStyle: parsed.avatarStyle,
  };
}

function buildAIPromptMap(promptsFile: GeneratedPromptsFile): Map<string, string> {
  const promptsBySlug = new Map<string, string>();

  for (const prompt of promptsFile.characters) {
    const slug = generateTagName(prompt.name).toLowerCase();
    if (!slug) continue;
    promptsBySlug.set(slug, prompt.visualGuide);
  }

  return promptsBySlug;
}

function buildRolesMap(roles: CharacterRoleCleanupResponse) {
  return buildCleanedCharacterSummaryMap(roles);
}

async function restoreChapters(params: {
  chapterFiles: Array<{ chapter: number; filePath: string }>;
  bookPath: string;
  dryRun: boolean;
  strict: boolean;
  stats: RestoreStats;
}): Promise<void> {
  const { chapterFiles, bookPath, dryRun, strict, stats } = params;
  const limit = pLimit(TASK_CONCURRENCY);

  console.log("\n--- Restoring Chapters ---");
  await Promise.all(
    chapterFiles.map((chapterFile) =>
      limit(async () => {
        const chapterHtml = fs.readFileSync(chapterFile.filePath, "utf-8");
        const basename = `chapter-${chapterFile.chapter}.html`;
        const folderPath = `${bookPath}/chapters-source`;

        try {
          await maybeRun(dryRun, `upload chapter ${chapterFile.chapter}`, async () => {
            await queueConvexCall(
              `upload chapter ${chapterFile.chapter}`,
              async () =>
                await convex.uploadFile({
                  folderPath,
                  basename,
                  content: Buffer.from(chapterHtml, "utf-8"),
                  contentType: "text/html",
                }),
            );
          });
          stats.chaptersUploaded += 1;

          const paragraphCount = computeParagraphCount(chapterHtml);
          let title: string | undefined;
          try {
            title = getChapterTitle(parseChapterIntoDom(chapterHtml));
          } catch {
            title = undefined;
          }

          await maybeRun(dryRun, `update chapter metadata ${chapterFile.chapter}`, async () => {
            await queueConvexCall(
              `chapter metadata ${chapterFile.chapter}`,
              async () =>
                await convex.updateChapterMetadata({
                  bookPath,
                  folderPath,
                  basename,
                  chapterNumber: chapterFile.chapter,
                  title,
                  paragraphCount,
                  sourceFormat: "html",
                }),
            );
          });
        } catch (error) {
          stats.failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed chapter ${chapterFile.chapter}: ${message}`);
          if (strict) throw error;
        }
      }),
    ),
  );
}

async function restoreCharacters(params: {
  summary: SummaryFile;
  rolesBySlug: Map<string, { referenceCard: string; role?: string }>;
  promptsBySlug: Map<string, string>;
  charactersDir: string;
  bookPath: string;
  dryRun: boolean;
  strict: boolean;
  stats: RestoreStats;
}): Promise<void> {
  const { summary, rolesBySlug, promptsBySlug, charactersDir, bookPath, dryRun, strict, stats } =
    params;
  const limit = pLimit(TASK_CONCURRENCY);

  console.log("\n--- Restoring Characters ---");
  await Promise.all(
    summary.characters.map((character) =>
      limit(async () => {
        const characterSlug = generateTagName(character.name).toLowerCase();
        const rolesRecord = rolesBySlug.get(characterSlug);
        if (!rolesRecord && strict) {
          throw new Error(`Missing roles metadata for canonical character slug: ${characterSlug}`);
        }

        const resolvedMetadata = resolveCharacterMetadataForUpload(
          { slug: characterSlug, referenceCard: character.referenceCard },
          rolesBySlug,
        );
        const aiPrompt = promptsBySlug.get(characterSlug);

        try {
          await maybeRun(dryRun, `upsert character ${characterSlug}`, async () => {
            await queueConvexCall(
              `upsert character ${characterSlug}`,
              async () =>
                await convex.ensureCharacterFolder({
                  bookPath,
                  characterSlug,
                  displayName: character.name,
                  summary: resolvedMetadata.summary,
                  role: resolvedMetadata.role,
                  aiPrompt,
                }),
            );
          });
          stats.charactersUpserted += 1;

          const avatarPath = getAvatarFileBySlug(charactersDir, characterSlug);
          if (!avatarPath) {
            const message = `Missing local avatar for ${characterSlug}`;
            if (strict) {
              throw new Error(message);
            }
            console.warn(`${message} - skipping avatar upload`);
            stats.skipped += 1;
            return;
          }

          const avatarExt = path.extname(avatarPath).toLowerCase();
          const avatarBasename = `avatar-large${avatarExt}`;
          await maybeRun(dryRun, `upload avatar for ${characterSlug}`, async () => {
            await queueConvexCall(
              `upload avatar ${characterSlug}`,
              async () =>
                await convex.uploadFile({
                  folderPath: `${bookPath}/characters/${characterSlug}`,
                  basename: avatarBasename,
                  content: fs.readFileSync(avatarPath),
                  contentType: getContentType(avatarPath),
                }),
            );
          });
          stats.avatarsUploaded += 1;

          await maybeRun(dryRun, `mark avatar ready for ${characterSlug}`, async () => {
            await queueConvexCall(
              `mark avatar ready ${characterSlug}`,
              async () =>
                await convex.markCharacterAvatarState({
                  characterPath: `${bookPath}/characters/${characterSlug}`,
                  state: "ready",
                }),
            );
          });
        } catch (error) {
          stats.failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed character ${characterSlug}: ${message}`);
          if (strict) throw error;
        }
      }),
    ),
  );
}

async function restoreBackgrounds(params: {
  backgroundFiles: string[];
  backgroundsDir: string;
  bookPath: string;
  dryRun: boolean;
  strict: boolean;
  stats: RestoreStats;
}): Promise<void> {
  const { backgroundFiles, backgroundsDir, bookPath, dryRun, strict, stats } = params;
  const limit = pLimit(TASK_CONCURRENCY);

  console.log("\n--- Restoring Backgrounds ---");
  await Promise.all(
    backgroundFiles.map((background) =>
      limit(async () => {
        const backgroundPath = path.join(backgroundsDir, background);
        try {
          await maybeRun(dryRun, `upload background ${background}`, async () => {
            await queueConvexCall(
              `upload background ${background}`,
              async () =>
                await convex.uploadFile({
                  folderPath: `${bookPath}/backgrounds`,
                  basename: background,
                  content: fs.readFileSync(backgroundPath),
                  contentType: getContentType(background),
                }),
            );
          });
          stats.backgroundsUploaded += 1;

          const match = background.match(/(\d+)-(\d+)/);
          if (!match) {
            stats.skipped += 1;
            return;
          }

          const chapter = parseInt(match[1], 10);
          const paragraph = parseInt(match[2], 10);
          await maybeRun(dryRun, `upsert background cue ${background}`, async () => {
            await queueConvexCall(
              `background cue ${background}`,
              async () =>
                await convex.upsertBackgroundCue({
                  bookPath,
                  chapter,
                  paragraph,
                  fileBasename: background,
                }),
            );
          });
          stats.cuesUpserted += 1;
        } catch (error) {
          stats.failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed background ${background}: ${message}`);
          if (strict) throw error;
        }
      }),
    ),
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { slug, bookDir, dryRun, strict } = options;
  const stats: RestoreStats = {
    chaptersUploaded: 0,
    charactersUpserted: 0,
    avatarsUploaded: 0,
    backgroundsUploaded: 0,
    cuesUpserted: 0,
    skipped: 0,
    failed: 0,
  };

  const inputDir = path.join(bookDir, "input");
  const outputDir = path.join(bookDir, "output");
  const tempOutputDir = path.join(bookDir, "temporary-output");

  const summaryPath = path.join(outputDir, "single-summary-per-person.json");
  const rolesPath = path.join(outputDir, "single-summary-per-person-roles.json");
  const promptsPath = path.join(tempOutputDir, "generated-prompts.json");
  const stylePath = path.join(tempOutputDir, "graphicalStyle.json");
  const settingsPath = path.join(tempOutputDir, "bookSettings.json");

  const charactersDir = path.join(outputDir, "characters");
  const backgroundsDir = path.join(outputDir, "backgrounds");

  requirePathExists(bookDir, "book folder");
  requirePathExists(inputDir, "input folder");
  requirePathExists(outputDir, "output folder");
  requirePathExists(tempOutputDir, "temporary-output folder");
  requirePathExists(summaryPath, "summary file");
  requirePathExists(rolesPath, "roles summary file");
  requirePathExists(charactersDir, "characters folder");
  requirePathExists(backgroundsDir, "backgrounds folder");

  const chapterFiles = getCanonicalChapterFiles(tempOutputDir);
  if (chapterFiles.length === 0) {
    throw new Error(`No canonical rewritten chapter files found in ${tempOutputDir}`);
  }

  const summary = parseSummaryFile(summaryPath);
  const rolesRaw = JSON.parse(fs.readFileSync(rolesPath, "utf-8")) as unknown;
  const roles = parseCharacterRoleCleanupResponse(rolesRaw);
  const rolesBySlug = buildRolesMap(roles);

  const prompts = fs.existsSync(promptsPath)
    ? parseGeneratedPromptsFile(promptsPath)
    : { characters: [] };
  const promptsBySlug = buildAIPromptMap(prompts);

  const canonicalSlugs = new Set(
    summary.characters.map((character) => generateTagName(character.name).toLowerCase()),
  );
  const extraRoles = roles.characters.filter(
    (character) => !canonicalSlugs.has(character.slug.trim().toLowerCase()),
  );

  const settings = loadBookSettings(settingsPath);
  const graphicalStyle = loadGraphicalStyle(stylePath);
  const bookPath = `books/${slug}`;

  console.log("=== Restore Book To Convex ===");
  console.log(`Book slug: ${slug}`);
  console.log(`Book dir: ${bookDir}`);
  console.log(`Convex book path: ${bookPath}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Strict mode: ${strict}`);
  console.log(`Canonical chapters: ${chapterFiles.length}`);
  console.log(`Canonical characters: ${summary.characters.length}`);
  console.log(`Background files: ${getBackgroundFiles(backgroundsDir).length}`);
  console.log(`Extra role-only entries ignored: ${extraRoles.length}`);

  await maybeRun(dryRun, "ensure book structure", async () => {
    await queueConvexCall(
      "ensure book structure",
      async () =>
        await convex.ensureBookStructure({
          jobId: `restore-${Date.now()}`,
          bookSlug: slug,
          metadata: {
            title: settings.title ?? humanizeSlug(slug),
            author: settings.author ?? "Unknown",
            language: settings.language,
            form: settings.form,
          },
        }),
    );
  });

  if (graphicalStyle) {
    await maybeRun(dryRun, "update graphical style", async () => {
      await queueConvexCall(
        "update graphical style",
        async () =>
          await convex.updateGraphicalStyle({
            bookPath,
            backgroundStyle: graphicalStyle.backgroundStyle,
            periodStyle: graphicalStyle.periodStyle,
            avatarStyle: graphicalStyle.avatarStyle,
          }),
      );
    });
  } else {
    console.log("Graphical style file not found - skipping style upload");
    stats.skipped += 1;
  }

  const backgroundFiles = getBackgroundFiles(backgroundsDir);
  await restoreChapters({ chapterFiles, bookPath, dryRun, strict, stats });
  await restoreCharacters({
    summary,
    rolesBySlug,
    promptsBySlug,
    charactersDir,
    bookPath,
    dryRun,
    strict,
    stats,
  });
  await restoreBackgrounds({ backgroundFiles, backgroundsDir, bookPath, dryRun, strict, stats });

  console.log("\n=== Restore Summary ===");
  console.log(`Chapters uploaded: ${stats.chaptersUploaded}`);
  console.log(`Characters upserted: ${stats.charactersUpserted}`);
  console.log(`Avatars uploaded: ${stats.avatarsUploaded}`);
  console.log(`Backgrounds uploaded: ${stats.backgroundsUploaded}`);
  console.log(`Background cues upserted: ${stats.cuesUpserted}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Failed: ${stats.failed}`);

  if (stats.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal restore error:", error);
  process.exit(1);
});
