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
const DEFAULT_RUN_WORKERS = 2;
const DEFAULT_WORKER_STAGGER_MS = 90_000;
const DEFAULT_RATE_SCALE = 0.9;

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

interface PipelineEnvOverrides {
  rateScale: number;
  embeddingsConcurrency?: number;
}

interface RunQueueOptions {
  limit?: number;
  onlyStep?: Step;
  workers: number;
  workerStaggerMs: number;
  envOverrides?: PipelineEnvOverrides;
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

const activePipelineChildren = new Set<Bun.Subprocess>();

function getPipelineRunnerPath() {
  return path.join(PIPELINE_ROOT, "src", "server", "queue-pipeline-runner.ts");
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function scaleRate(value: number, scale: number): number {
  return Math.max(1, Math.round(value * scale));
}

function buildChildEnv(overrides?: PipelineEnvOverrides): Record<string, string> | undefined {
  if (!overrides) {
    return undefined;
  }

  const envPatch: Record<string, string> = {};
  const normalizedScale = Number.isFinite(overrides.rateScale)
    ? Math.max(0.1, Math.min(2, overrides.rateScale))
    : 1;

  if (normalizedScale !== 1) {
    const primaryConcurrency = parsePositiveInt(process.env.REWRITE_PRIMARY_CONCURRENCY, 60);
    const primaryIntervalCap = parsePositiveInt(process.env.REWRITE_PRIMARY_INTERVAL_CAP, 900);
    const fallbackConcurrency = parsePositiveInt(process.env.REWRITE_FALLBACK_CONCURRENCY, 8);
    const fallbackPairLimit = parsePositiveInt(process.env.REWRITE_FALLBACK_PAIR_LIMIT, 8);

    envPatch.REWRITE_PRIMARY_CONCURRENCY = `${scaleRate(primaryConcurrency, normalizedScale)}`;
    envPatch.REWRITE_PRIMARY_INTERVAL_CAP = `${scaleRate(primaryIntervalCap, normalizedScale)}`;
    envPatch.REWRITE_FALLBACK_CONCURRENCY = `${scaleRate(fallbackConcurrency, normalizedScale)}`;
    envPatch.REWRITE_FALLBACK_PAIR_LIMIT = `${scaleRate(fallbackPairLimit, normalizedScale)}`;
  }

  if (typeof overrides.embeddingsConcurrency === "number" && overrides.embeddingsConcurrency > 0) {
    envPatch.EMBEDDINGS_REQUEST_CONCURRENCY = `${Math.round(overrides.embeddingsConcurrency)}`;
  }

  return Object.keys(envPatch).length > 0 ? envPatch : undefined;
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
  envOverrides?: PipelineEnvOverrides,
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

    const childEnvPatch = buildChildEnv(envOverrides);
    const child = Bun.spawn(args, {
      cwd: PIPELINE_ROOT,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: childEnvPatch ? { ...process.env, ...childEnvPatch } : process.env,
    });
    activePipelineChildren.add(child);

    const stdoutPromise = pipeProcessOutput(child.stdout, (text) => process.stdout.write(text));
    const stderrPromise = pipeProcessOutput(
      child.stderr,
      (text) => process.stderr.write(text),
      (text) => {
        stderrTail = (stderrTail + text).slice(-8000);
      },
    );

    Promise.all([stdoutPromise, stderrPromise]).catch((err) => {
      activePipelineChildren.delete(child);
      reject(err);
    });

    child.exited
      .then(async (code) => {
        await Promise.allSettled([stdoutPromise, stderrPromise]);
        activePipelineChildren.delete(child);
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
        activePipelineChildren.delete(child);
        reject(err);
      });
  });
}

function setupSignalHandlers() {
  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`\nReceived ${signal}. Stopping queue...`);
    const children = Array.from(activePipelineChildren).filter((child) => !child.killed);
    if (children.length === 0) {
      process.exit(130);
      return;
    }

    for (const child of children) {
      child.kill("SIGTERM");
    }
    setTimeout(() => {
      for (const child of children) {
        if (!child.killed) {
          console.log("Force killing active pipeline subprocess...");
          child.kill("SIGKILL");
        }
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

async function runQueue(options: RunQueueOptions) {
  const { limit, onlyStep, workers, workerStaggerMs, envOverrides } = options;
  setupSignalHandlers();
  const queue = readQueue();
  const disabled = loadDisabledSlugs();
  let consecutiveFailures = 0;
  let claimed = 0;
  let stopClaiming = false;
  let loggedStopAfterFailures = false;
  let loggedLimitReached = false;

  if (disabled.size > 0) {
    console.log(`Loaded ${disabled.size} disabled slugs`);
  }
  console.log(
    `Running queue with workers=${workers}, stagger=${workerStaggerMs}ms, rateScale=${envOverrides?.rateScale ?? 1}, embeddingsConcurrency=${envOverrides?.embeddingsConcurrency ?? "default"}`,
  );

  let queueLock = Promise.resolve();
  const withQueueLock = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    const previousLock = queueLock;
    let release: () => void = () => {};
    queueLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previousLock;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  const markDisabledSlugs = async () => {
    await withQueueLock(() => {
      let changed = false;
      for (const item of queue.items) {
        if (!disabled.has(item.slug)) continue;
        if (item.status === "done" || item.status === "skipped") continue;
        item.status = "skipped";
        item.updatedAt = new Date().toISOString();
        changed = true;
      }
      if (changed) {
        writeQueue(queue);
      }
    });
  };

  const claimNextItem = async (): Promise<QueueItem | null> => {
    return await withQueueLock(() => {
      if (stopClaiming) {
        return null;
      }
      if (limit !== undefined && claimed >= limit) {
        if (!loggedLimitReached) {
          console.log(`Reached limit ${limit}. Stopping new claims.`);
          loggedLimitReached = true;
        }
        stopClaiming = true;
        return null;
      }

      const item = queue.items.find(
        (candidate) => candidate.status === "queued" || candidate.status === "failed",
      );
      if (!item) {
        return null;
      }

      item.status = "running";
      item.attempts += 1;
      item.lastError = undefined;
      item.updatedAt = new Date().toISOString();
      claimed += 1;
      writeQueue(queue);
      return item;
    });
  };

  const completeItem = async (
    slug: string,
    result: { status: "done" } | { status: "failed"; error: string },
  ) => {
    await withQueueLock(() => {
      const item = queue.items.find((candidate) => candidate.slug === slug);
      if (!item) {
        return;
      }

      if (result.status === "done") {
        item.status = "done";
        item.lastError = undefined;
        item.updatedAt = new Date().toISOString();
        writeQueue(queue);
        console.log(`✔ Completed ${slug}`);
        consecutiveFailures = 0;
        return;
      }

      item.status = "failed";
      item.lastError = result.error || "Unknown error";
      item.updatedAt = new Date().toISOString();
      writeQueue(queue);
      console.log(`✖ Failed ${slug}: ${item.lastError}`);
      consecutiveFailures += 1;

      if (consecutiveFailures >= 3) {
        stopClaiming = true;
        if (!loggedStopAfterFailures) {
          console.log("Stopping after 3 consecutive failures.");
          loggedStopAfterFailures = true;
        }
      }
    });
  };

  await markDisabledSlugs();

  const workerTasks = Array.from({ length: workers }, (_, workerIndex) =>
    (async () => {
      if (workerStaggerMs > 0 && workerIndex > 0) {
        const delay = workerStaggerMs * workerIndex;
        console.log(`[worker-${workerIndex + 1}] Delaying start by ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      while (true) {
        const item = await claimNextItem();
        if (!item) {
          return;
        }

        console.log(`\n=== [worker-${workerIndex + 1}] Processing ${item.slug} ===`);

        try {
          await convertAndSaveSEBook(item.slug);
          const result = await runPipelineInSubprocess(item.slug, onlyStep, envOverrides);
          if (result.status === "done") {
            await completeItem(item.slug, { status: "done" });
          } else {
            await completeItem(item.slug, {
              status: "failed",
              error: result.error || "Unknown error",
            });
          }
        } catch (err) {
          await completeItem(item.slug, {
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })(),
  );

  await Promise.all(workerTasks);

  console.log("\nQueue run complete.");
  summarizeQueue(queue);
}

async function runSingleSlug(slug: string, onlyStep?: Step, envOverrides?: PipelineEnvOverrides) {
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

    const result = await runPipelineInSubprocess(slug, onlyStep, envOverrides);

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
      "Run queue",
      (y) =>
        y
          .option("limit", { type: "number", describe: "Max items to process" })
          .option("slug", {
            type: "string",
            describe: "Process only this slug (bypasses queue iteration)",
          })
          .option("workers", {
            type: "number",
            describe: "Number of concurrent pipeline subprocess workers",
          })
          .option("worker-stagger-ms", {
            type: "number",
            describe: "Delay between worker starts in milliseconds",
          })
          .option("rate-scale", {
            type: "number",
            describe: "Scale factor applied to rewrite queue-related child env limits (e.g. 0.9)",
          })
          .option("embeddings-concurrency", {
            type: "number",
            describe: "Override EMBEDDINGS_REQUEST_CONCURRENCY in child subprocesses (optional)",
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
        const workers = Math.max(
          1,
          Math.round(
            Number.isFinite(args.workers)
              ? Number(args.workers)
              : parsePositiveInt(process.env.SE_QUEUE_WORKERS, DEFAULT_RUN_WORKERS),
          ),
        );
        const workerStaggerMs = Math.max(
          0,
          Math.round(
            Number.isFinite(args["worker-stagger-ms"])
              ? Number(args["worker-stagger-ms"])
              : parsePositiveInt(process.env.SE_QUEUE_WORKER_STAGGER_MS, DEFAULT_WORKER_STAGGER_MS),
          ),
        );
        const rawRateScale = Number.isFinite(args["rate-scale"])
          ? Number(args["rate-scale"])
          : Number.parseFloat(process.env.SE_QUEUE_RATE_SCALE || `${DEFAULT_RATE_SCALE}`);
        const rateScale = Number.isFinite(rawRateScale) ? rawRateScale : 1;
        const embeddingsConcurrencyRaw = Number.isFinite(args["embeddings-concurrency"])
          ? Number(args["embeddings-concurrency"])
          : Number.parseInt(process.env.SE_QUEUE_EMBEDDINGS_CONCURRENCY || "", 10);
        const embeddingsConcurrency = Number.isFinite(embeddingsConcurrencyRaw)
          ? Math.max(1, Math.round(embeddingsConcurrencyRaw))
          : undefined;

        const envOverrides: PipelineEnvOverrides | undefined =
          rateScale !== 1 || embeddingsConcurrency !== undefined
            ? { rateScale, embeddingsConcurrency }
            : undefined;

        if (args.slug) {
          await runSingleSlug(args.slug, onlyStep, envOverrides);
          return;
        }
        await runQueue({ limit: args.limit, onlyStep, workers, workerStaggerMs, envOverrides });
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
