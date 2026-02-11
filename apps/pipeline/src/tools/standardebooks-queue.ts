#!/usr/bin/env bun
import path from "path";
import fs from "fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import dotenv from "dotenv";
import { convertAndSaveSEBook } from "./se-converter/index";
import { isValidStep } from "../server/pipeline-progress";
import { type Step } from "../shared/pipelineTypes";

dotenv.config({ path: path.resolve(import.meta.dir, "..", "..", ".env") });

const PIPELINE_ROOT = path.resolve(import.meta.dir, "..", "..");
const REPO_ROOT = path.resolve(PIPELINE_ROOT, "..", "..");
const CONVEX_ASSETS_DIR = path.join(REPO_ROOT, "ConvexAssets", "books");
const QUEUE_PATH = path.join(PIPELINE_ROOT, "standardebooks-data", "queue.json");
const BOOKS_DATA_DIR = path.join(PIPELINE_ROOT, "books-data");

const DISABLED_PATH = path.join(PIPELINE_ROOT, "standardebooks-data", "disabled-slugs.json");
const SE_DATA_DIR = path.join(PIPELINE_ROOT, "standardebooks-data");
const CATEGORIES_PATH = path.join(SE_DATA_DIR, "book-categories.json");
const POPULARITY_PATH = path.join(SE_DATA_DIR, "popularity.json");
const GENRE_CATEGORIES_PATH = path.join(SE_DATA_DIR, "categories.json");
const SE_BOOKS_DIR = path.join(SE_DATA_DIR, "books");

const PHASE_ONE_TITLE_EXCLUSION_PATTERN = /\b(poetry|poems|ballads|essays?)\b/i;
const PHASE_ONE_MANUAL_EXCLUDED_SLUGS: Record<string, string> = {
  "george-bernard-shaw_short-plays": "manual-non-novel-play",
  "j-m-synge_short-plays": "manual-non-novel-play",
  "mary-weston-fordham_magnolia-leaves": "manual-non-novel-poetry",
  "robert-frost_north-of-boston": "manual-non-novel-poetry",
  "w-e-b-du-bois_darkwater": "manual-non-novel-philosophy",
  "w-e-b-du-bois_the-souls-of-black-folk": "manual-non-novel-philosophy",
  "thomas-de-quincey_suspiria-de-profundis": "manual-non-novel-prose-poems",
  "washington-irving_the-sketchbook-of-geoffrey-crayon-gent": "manual-non-novel-short-stories",
  "lord-dunsany_the-book-of-wonder_sidney-h-sime": "manual-non-novel-short-stories",
};

const VALID_BUCKETS = [
  "1-novels-standard",
  "2-novels-embedded-drama",
  "3-narrative-nonfiction",
  "4-big-novels",
  "5-epic-poetry",
  "6-story-collections",
  "7-no-character-nonfiction",
  "8-lyric-poetry",
  "9-drama",
] as const;

type Bucket = (typeof VALID_BUCKETS)[number];

const DEFAULT_BUCKETS: Bucket[] = ["1-novels-standard", "2-novels-embedded-drama"];

interface CategoryEntry {
  title: string;
  author: string;
  wordCount: number;
  bucket: string;
  chapters: number;
}

interface PopularityFile {
  meta: { source: string; sortedBy: string; fetchedAt: string; totalBooks: number };
  books: { rank: number; slug: string; title: string; author: string }[];
}

type GenreCategories = Record<string, string[]>;

type QueueStatus = "queued" | "running" | "done" | "failed" | "skipped";

interface QueueItem {
  slug: string;
  status: QueueStatus;
  attempts: number;
  lastError?: string;
  updatedAt: string;
}

interface QueueFile {
  meta: {
    createdAt: string;
    updatedAt: string;
    total: number;
    bucket: string;
    priorityCount: number;
    excluded: {
      alreadyExists: number;
      otherBucket: number;
      wordCount?: number;
      phaseOneGuard?: number;
    };
  };
  items: QueueItem[];
}

interface BookMetadata {
  title?: string;
  description?: string;
  subjects?: string[];
}

interface PhaseOneGuardDecision {
  allow: boolean;
  reason?: string;
}

type QueueFilterDecision =
  | { include: true }
  | { include: false; reason: "word-count" | "phase-one-guard"; detail?: string };

interface QueueBuildSelectionResult {
  items: QueueItem[];
  excludedExisting: number;
  excludedByWordCount: number;
  excludedByPhaseOneGuard: number;
  guardReasonCounts: Map<string, number>;
  guardExamples: string[];
}

function readQueue(): QueueFile {
  if (!fs.existsSync(QUEUE_PATH)) {
    throw new Error(`Queue file not found: ${QUEUE_PATH}`);
  }
  return JSON.parse(fs.readFileSync(QUEUE_PATH, "utf-8")) as QueueFile;
}

function writeQueue(queue: QueueFile) {
  queue.meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
}

function summarizeQueue(queue: QueueFile) {
  const counts: Record<QueueStatus, number> = {
    queued: 0,
    running: 0,
    done: 0,
    failed: 0,
    skipped: 0,
  };
  for (const item of queue.items) {
    counts[item.status] += 1;
  }
  console.log(`Queue: ${queue.items.length} items`);
  console.log(`  queued:  ${counts.queued}`);
  console.log(`  running: ${counts.running}`);
  console.log(`  done:    ${counts.done}`);
  console.log(`  failed:  ${counts.failed}`);
  console.log(`  skipped: ${counts.skipped}`);
}

let activePipelineChild: Bun.Subprocess | null = null;

function getPipelineRunnerPath() {
  return path.join(PIPELINE_ROOT, "src", "server", "queue-pipeline-runner.ts");
}

async function pipeProcessOutput(
  stream: ReadableStream<Uint8Array> | null,
  write: (text: string) => void,
  onText?: (text: string) => void,
) {
  if (!stream) return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (!text) continue;
      write(text);
      onText?.(text);
    }
    const flush = decoder.decode();
    if (flush) {
      write(flush);
      onText?.(flush);
    }
  } finally {
    reader.releaseLock();
  }
}

async function runPipelineInSubprocess(
  slug: string,
  onlyStep?: Step,
): Promise<{ status: "done" } | { status: "error"; error: string }> {
  const runnerPath = getPipelineRunnerPath();
  if (!fs.existsSync(runnerPath)) {
    return { status: "error", error: `Pipeline runner not found: ${runnerPath}` };
  }

  return await new Promise((resolve, reject) => {
    let stderrTail = "";
    const args = ["bun", runnerPath, "--slug", slug];
    if (onlyStep) {
      args.push("--only-step", onlyStep);
    }

    const child = Bun.spawn(args, {
      cwd: PIPELINE_ROOT,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    activePipelineChild = child;

    const stdoutPromise = pipeProcessOutput(child.stdout, (text) => process.stdout.write(text));
    const stderrPromise = pipeProcessOutput(
      child.stderr,
      (text) => process.stderr.write(text),
      (text) => {
        stderrTail = (stderrTail + text).slice(-8000);
      },
    );

    Promise.all([stdoutPromise, stderrPromise]).catch((err) => {
      activePipelineChild = null;
      reject(err);
    });

    child.exited
      .then(async (code) => {
        await Promise.allSettled([stdoutPromise, stderrPromise]);
        activePipelineChild = null;
        if (code === 0) {
          resolve({ status: "done" });
          return;
        }
        const trimmed = stderrTail.trim();
        const fallbackError = `Pipeline subprocess failed (code=${code})`;
        const error = trimmed ? trimmed.split("\n").slice(-10).join("\n") : fallbackError;
        resolve({ status: "error", error });
      })
      .catch((err) => {
        activePipelineChild = null;
        reject(err);
      });
  });
}

function setupSignalHandlers() {
  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`\nReceived ${signal}. Stopping queue...`);
    const child = activePipelineChild;
    if (!child || child.killed) {
      process.exit(130);
      return;
    }

    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) {
        console.log("Force killing active pipeline subprocess...");
        child.kill("SIGKILL");
      }
      process.exit(130);
    }, 10_000);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function loadBookCategories(): Map<string, CategoryEntry> {
  if (!fs.existsSync(CATEGORIES_PATH)) {
    throw new Error(`book-categories.json not found: ${CATEGORIES_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(CATEGORIES_PATH, "utf-8")) as Record<
    string,
    CategoryEntry
  >;
  return new Map(Object.entries(raw));
}

function loadPopularityRanks(): Map<string, number> {
  if (!fs.existsSync(POPULARITY_PATH)) {
    throw new Error(`popularity.json not found: ${POPULARITY_PATH}`);
  }
  const data = JSON.parse(fs.readFileSync(POPULARITY_PATH, "utf-8")) as PopularityFile;
  const ranks = new Map<string, number>();
  for (const book of data.books) {
    ranks.set(book.slug, book.rank);
  }
  return ranks;
}

function loadGenreCategories(): GenreCategories {
  if (!fs.existsSync(GENRE_CATEGORIES_PATH)) {
    throw new Error(`categories.json not found: ${GENRE_CATEGORIES_PATH}`);
  }
  return JSON.parse(fs.readFileSync(GENRE_CATEGORIES_PATH, "utf-8")) as GenreCategories;
}

const metadataCache = new Map<string, BookMetadata | null>();

function loadBookMetadata(slug: string): BookMetadata | null {
  if (metadataCache.has(slug)) {
    return metadataCache.get(slug) ?? null;
  }

  const metadataPath = path.join(SE_BOOKS_DIR, slug, "metadata.json");
  if (!fs.existsSync(metadataPath)) {
    metadataCache.set(slug, null);
    return null;
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8")) as BookMetadata;
  metadataCache.set(slug, metadata);
  return metadata;
}

function assessPhaseOneNarrativeEligibility(
  slug: string,
  fallbackTitle: string,
): PhaseOneGuardDecision {
  const metadata = loadBookMetadata(slug);
  if (!metadata) {
    return { allow: true };
  }

  const title = (metadata.title ?? fallbackTitle).trim();
  if (PHASE_ONE_TITLE_EXCLUSION_PATTERN.test(title)) {
    return { allow: false, reason: "title-poetry-or-essays" };
  }

  return { allow: true };
}

function evaluateQueueFilters(
  slug: string,
  category: CategoryEntry,
  options: { maxWords?: number; applyPhaseOneGuards: boolean },
): QueueFilterDecision {
  if (options.maxWords !== undefined && category.wordCount > options.maxWords) {
    return { include: false, reason: "word-count" };
  }

  if (!options.applyPhaseOneGuards) {
    return { include: true };
  }

  const manualReason = PHASE_ONE_MANUAL_EXCLUDED_SLUGS[slug];
  if (manualReason) {
    return { include: false, reason: "phase-one-guard", detail: manualReason };
  }

  const decision = assessPhaseOneNarrativeEligibility(slug, category.title);
  if (!decision.allow) {
    return { include: false, reason: "phase-one-guard", detail: decision.reason ?? "unknown" };
  }

  return { include: true };
}

function hasExistingArtifacts(slug: string): boolean {
  const existingDir = path.join(BOOKS_DATA_DIR, slug);
  const convexMirrorDir = path.join(CONVEX_ASSETS_DIR, slug);
  return fs.existsSync(existingDir) || fs.existsSync(convexMirrorDir);
}

function buildQueueItems(
  orderedSlugs: string[],
  bookCategories: Map<string, CategoryEntry>,
  now: string,
  options: { includeExisting: boolean; maxWords?: number; applyPhaseOneGuards: boolean },
): QueueBuildSelectionResult {
  const items: QueueItem[] = [];
  let excludedExisting = 0;
  let excludedByWordCount = 0;
  let excludedByPhaseOneGuard = 0;
  const guardReasonCounts = new Map<string, number>();
  const guardExamples: string[] = [];

  for (const slug of orderedSlugs) {
    const category = bookCategories.get(slug);
    if (!category) {
      continue;
    }

    const decision = evaluateQueueFilters(slug, category, {
      maxWords: options.maxWords,
      applyPhaseOneGuards: options.applyPhaseOneGuards,
    });
    if (!decision.include) {
      if (decision.reason === "word-count") {
        excludedByWordCount += 1;
      } else {
        excludedByPhaseOneGuard += 1;
        const reason = decision.detail ?? "unknown";
        guardReasonCounts.set(reason, (guardReasonCounts.get(reason) ?? 0) + 1);
        if (guardExamples.length < 8) {
          guardExamples.push(`${slug} (${reason})`);
        }
      }
      continue;
    }

    if (!options.includeExisting && hasExistingArtifacts(slug)) {
      excludedExisting += 1;
      continue;
    }

    items.push({ slug, status: "queued", attempts: 0, updatedAt: now });
  }

  return {
    items,
    excludedExisting,
    excludedByWordCount,
    excludedByPhaseOneGuard,
    guardReasonCounts,
    guardExamples,
  };
}

function buildPopularityOrder(
  targetBuckets: Bucket[],
  bookCategories: Map<string, CategoryEntry>,
  popularityRanks: Map<string, number>,
  genreCategories: GenreCategories,
): { orderedSlugs: string[]; priorityCount: number } {
  const bucketSet = new Set<string>(targetBuckets);
  const isInBucket = (slug: string) => {
    const entry = bookCategories.get(slug);
    return entry !== undefined && bucketSet.has(entry.bucket);
  };

  // Priority tier: top 7 per genre category (filtered to target buckets), round-robin interleaved
  const PRIORITY_PER_GENRE = 7;
  const genreNames = Object.keys(genreCategories);

  // For each genre, collect up to 7 slugs that are in the target bucket
  const genreTop: string[][] = genreNames.map((genre) => {
    const slugs: string[] = [];
    for (const slug of genreCategories[genre]) {
      if (slugs.length >= PRIORITY_PER_GENRE) break;
      if (isInBucket(slug)) {
        slugs.push(slug);
      }
    }
    return slugs;
  });

  // Interleave round-robin: genre1[0], genre2[0], ..., genre1[1], genre2[1], ...
  const prioritySlugs: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < PRIORITY_PER_GENRE; i++) {
    for (const top of genreTop) {
      if (i < top.length && !seen.has(top[i])) {
        prioritySlugs.push(top[i]);
        seen.add(top[i]);
      }
    }
  }

  // Remainder: all other books in the bucket, sorted by popularity rank
  const allBucketSlugs: string[] = [];
  for (const [slug, entry] of bookCategories) {
    if (bucketSet.has(entry.bucket) && !seen.has(slug)) {
      allBucketSlugs.push(slug);
    }
  }
  allBucketSlugs.sort((a, b) => {
    const ra = popularityRanks.get(a) ?? Infinity;
    const rb = popularityRanks.get(b) ?? Infinity;
    return ra - rb;
  });

  return {
    orderedSlugs: [...prioritySlugs, ...allBucketSlugs],
    priorityCount: prioritySlugs.length,
  };
}

function buildQueue(
  bucket?: string,
  includeExisting = false,
  options?: { skipPhaseOneGuards?: boolean; maxWords?: number },
) {
  const targetBuckets: Bucket[] = bucket ? [bucket as Bucket] : DEFAULT_BUCKETS;
  const bucketLabel = targetBuckets.join("+");
  const usingDefaultBuckets = bucket === undefined;
  const applyPhaseOneGuards = usingDefaultBuckets && !options?.skipPhaseOneGuards;
  const maxWords = options?.maxWords;

  const bookCategories = loadBookCategories();
  const popularityRanks = loadPopularityRanks();
  const genreCategories = loadGenreCategories();

  const { orderedSlugs, priorityCount } = buildPopularityOrder(
    targetBuckets,
    bookCategories,
    popularityRanks,
    genreCategories,
  );

  const now = new Date().toISOString();
  const {
    items,
    excludedExisting,
    excludedByWordCount,
    excludedByPhaseOneGuard,
    guardReasonCounts,
    guardExamples,
  } = buildQueueItems(orderedSlugs, bookCategories, now, {
    includeExisting,
    maxWords,
    applyPhaseOneGuards,
  });

  const totalInBucket = orderedSlugs.length;
  const totalEligibleAfterGuards = totalInBucket - excludedByWordCount - excludedByPhaseOneGuard;
  const queue: QueueFile = {
    meta: {
      createdAt: now,
      updatedAt: now,
      total: items.length,
      bucket: bucketLabel,
      priorityCount,
      excluded: {
        alreadyExists: excludedExisting,
        otherBucket: bookCategories.size - totalInBucket,
        ...(maxWords !== undefined ? { wordCount: excludedByWordCount } : {}),
        ...(applyPhaseOneGuards ? { phaseOneGuard: excludedByPhaseOneGuard } : {}),
      },
    },
    items,
  };

  writeQueue(queue);

  console.log(`Queue written to ${QUEUE_PATH}`);
  console.log(`Bucket: ${bucketLabel}`);
  console.log(`Priority tier (top 7/genre): ${priorityCount} books`);
  console.log(`Total in bucket: ${totalInBucket}`);
  if (maxWords !== undefined) {
    console.log(`Skipped (word count > ${maxWords}): ${excludedByWordCount}`);
  }
  if (applyPhaseOneGuards) {
    console.log(`Skipped (phase 1 narrative guard): ${excludedByPhaseOneGuard}`);
    if (guardReasonCounts.size > 0) {
      const reasons = Array.from(guardReasonCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => `${reason}=${count}`)
        .join(", ");
      console.log(`  reasons: ${reasons}`);
    }
    if (guardExamples.length > 0) {
      console.log(`  examples: ${guardExamples.join(", ")}`);
    }
  }
  console.log(`Eligible after guards: ${totalEligibleAfterGuards}`);
  console.log(`Skipped (already exists): ${excludedExisting}`);
  console.log(`Queued: ${items.length}`);
  summarizeQueue(queue);
}

function loadDisabledSlugs(): Set<string> {
  if (!fs.existsSync(DISABLED_PATH)) return new Set();
  const data = JSON.parse(fs.readFileSync(DISABLED_PATH, "utf-8")) as string[];
  return new Set(data);
}

async function runQueue(limit?: number, onlyStep?: Step) {
  setupSignalHandlers();
  const queue = readQueue();
  const disabled = loadDisabledSlugs();
  let consecutiveFailures = 0;
  let processed = 0;

  if (disabled.size > 0) {
    console.log(`Loaded ${disabled.size} disabled slugs`);
  }

  for (const item of queue.items) {
    if (item.status === "done") {
      continue;
    }

    if (disabled.has(item.slug)) {
      if (item.status !== "skipped") {
        item.status = "skipped";
        item.updatedAt = new Date().toISOString();
        writeQueue(queue);
      }
      continue;
    }

    if (limit !== undefined && processed >= limit) {
      console.log(`Reached limit ${limit}. Stopping.`);
      break;
    }

    item.status = "running";
    item.attempts += 1;
    item.lastError = undefined;
    item.updatedAt = new Date().toISOString();
    writeQueue(queue);

    console.log(`\n=== Processing ${item.slug} ===`);

    try {
      await convertAndSaveSEBook(item.slug);
      const result = await runPipelineInSubprocess(item.slug, onlyStep);

      if (result.status === "done") {
        item.status = "done";
        item.updatedAt = new Date().toISOString();
        writeQueue(queue);
        console.log(`✔ Completed ${item.slug}`);
        consecutiveFailures = 0;
      } else {
        item.status = "failed";
        item.lastError = result.error || "Unknown error";
        item.updatedAt = new Date().toISOString();
        writeQueue(queue);
        console.log(`✖ Failed ${item.slug}: ${item.lastError}`);
        consecutiveFailures += 1;
      }
    } catch (err) {
      item.status = "failed";
      item.lastError = err instanceof Error ? err.message : String(err);
      item.updatedAt = new Date().toISOString();
      writeQueue(queue);
      console.log(`✖ Failed ${item.slug}: ${item.lastError}`);
      consecutiveFailures += 1;
    }

    processed += 1;

    if (consecutiveFailures >= 3) {
      console.log("Stopping after 3 consecutive failures.");
      break;
    }
  }

  console.log("\nQueue run complete.");
  summarizeQueue(queue);
}

async function runSingleSlug(slug: string, onlyStep?: Step) {
  setupSignalHandlers();
  const queueExists = fs.existsSync(QUEUE_PATH);
  const queue = queueExists ? readQueue() : null;
  const queueItem = queue?.items.find((item) => item.slug === slug);

  if (queueExists && !queueItem) {
    console.log(`Slug ${slug} not found in queue. Running generation without queue tracking.`);
  }

  if (queue && queueItem) {
    queueItem.status = "running";
    queueItem.attempts += 1;
    queueItem.lastError = undefined;
    queueItem.updatedAt = new Date().toISOString();
    writeQueue(queue);
  }

  console.log(`\n=== Processing ${slug} ===`);

  try {
    const bookDir = path.join(BOOKS_DATA_DIR, slug);
    if (!onlyStep || !fs.existsSync(bookDir)) {
      await convertAndSaveSEBook(slug);
    } else {
      console.log(`Using existing books-data/${slug} for single-step run`);
    }

    const result = await runPipelineInSubprocess(slug, onlyStep);

    if (result.status === "done") {
      if (queue && queueItem) {
        queueItem.status = "done";
        queueItem.updatedAt = new Date().toISOString();
        writeQueue(queue);
      }
      console.log(`✔ Completed ${slug}`);
      return;
    }

    if (queue && queueItem) {
      queueItem.status = "failed";
      queueItem.lastError = result.error || "Unknown error";
      queueItem.updatedAt = new Date().toISOString();
      writeQueue(queue);
    }

    throw new Error(result.error || "Pipeline subprocess failed");
  } catch (err) {
    if (queue && queueItem) {
      queueItem.status = "failed";
      queueItem.lastError = err instanceof Error ? err.message : String(err);
      queueItem.updatedAt = new Date().toISOString();
      writeQueue(queue);
    }

    throw err;
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("standardebooks-queue")
    .command(
      "build",
      "Build queue from standardebooks-data",
      (y) =>
        y
          .option("bucket", {
            type: "string",
            choices: VALID_BUCKETS,
            describe:
              "Only include books from this bucket (default: 1-novels-standard + 2-novels-embedded-drama)",
          })
          .option("include-existing", {
            type: "boolean",
            default: false,
            describe: "Include books that already have books-data or ConvexAssets directories",
          })
          .option("skip-phase-one-guards", {
            type: "boolean",
            default: false,
            describe:
              "When building default bucket queue, allow poetry/essays/travel entries even if detected",
          })
          .option("max-words", {
            type: "number",
            describe: "Exclude books above this word count (optional; disabled by default)",
          }),
      async (args) => {
        buildQueue(args.bucket, args["include-existing"], {
          skipPhaseOneGuards: args["skip-phase-one-guards"],
          maxWords: args["max-words"],
        });
      },
    )
    .command(
      "run",
      "Run queue (one book at a time)",
      (y) =>
        y
          .option("limit", { type: "number", describe: "Max items to process" })
          .option("slug", {
            type: "string",
            describe: "Process only this slug (bypasses queue iteration)",
          })
          .option("only-step", {
            type: "string",
            describe:
              "Run exactly one step (fails if required dependencies are not marked completed)",
          }),
      async (args) => {
        const onlyStepRaw = args["only-step"];
        if (onlyStepRaw && !isValidStep(onlyStepRaw)) {
          throw new Error(`Invalid step slug: ${onlyStepRaw}`);
        }
        const onlyStep = onlyStepRaw as Step | undefined;

        if (args.slug) {
          await runSingleSlug(args.slug, onlyStep);
          return;
        }
        await runQueue(args.limit, onlyStep);
      },
    )
    .command("status", "Show queue status", {}, () => {
      const queue = readQueue();
      summarizeQueue(queue);
    })
    .demandCommand(1)
    .help()
    .parse();

  return argv;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
