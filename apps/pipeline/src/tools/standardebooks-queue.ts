#!/usr/bin/env bun
import path from "path";
import fs from "fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import dotenv from "dotenv";
import { convertAndSaveSEBook } from "./se-converter/index";
import { startPipeline } from "../server/pipeline";
import { classifyDramaBooks, type BookAnalysis } from "./se-converter/drama-classifier";

dotenv.config({ path: path.resolve(import.meta.dir, "..", "..", ".env") });

const PIPELINE_ROOT = path.resolve(import.meta.dir, "..", "..");
const REPO_ROOT = path.resolve(PIPELINE_ROOT, "..", "..");
const CONVEX_ASSETS_DIR = path.join(REPO_ROOT, "ConvexAssets", "books");
const INDEX_PATH = path.join(PIPELINE_ROOT, "standardebooks-data", "index.json");
const QUEUE_PATH = path.join(PIPELINE_ROOT, "standardebooks-data", "queue.json");
const BOOKS_DATA_DIR = path.join(PIPELINE_ROOT, "books-data");

const EMBEDDED_DRAMA_WHITELIST = [
  "a-a-milne_the-house-at-pooh-corner",
  "james-joyce_ulysses",
  "f-scott-fitzgerald_the-beautiful-and-damned",
  "george-eliot_daniel-deronda",
  "ann-radcliffe_the-mysteries-of-udolpho",
  "dorothy-l-sayers_clouds-of-witness",
  "dorothy-l-sayers_unnatural-death",
  "anna-katharine-green_the-leavenworth-case",
  "richard-hughes_a-high-wind-in-jamaica",
  "william-faulkner_soldiers-pay",
  "william-wells-brown_clotel",
];

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
    embeddedWhitelist: string[];
    excluded: { fullPlay: number; embeddedDrama: number; alreadyExists: number };
    includedEmbedded: number;
  };
  items: QueueItem[];
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJob(job: { status: string; logs?: string[]; error?: string }) {
  let lastLogIndex = 0;
  while (true) {
    const logs = job.logs || [];
    if (logs.length > lastLogIndex) {
      for (let i = lastLogIndex; i < logs.length; i += 1) {
        console.log(logs[i]);
      }
      lastLogIndex = logs.length;
    }

    if (job.status === "done") return { status: "done" as const };
    if (job.status === "error") return { status: "error" as const, error: job.error };

    await sleep(1000);
  }
}

async function buildQueue() {
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error(`index.json not found: ${INDEX_PATH}`);
  }

  const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as { books: { slug: string }[] };
  const slugs = index.books.map((b) => b.slug);

  const analyses = await classifyDramaBooks(slugs);
  const analysisBySlug = new Map<string, BookAnalysis>();
  for (const analysis of analyses) {
    analysisBySlug.set(analysis.slug, analysis);
  }

  const now = new Date().toISOString();
  const items: QueueItem[] = [];
  let excludedFull = 0;
  let excludedEmbedded = 0;
  let excludedExisting = 0;
  let includedEmbedded = 0;

  for (const slug of slugs) {
    const existingDir = path.join(BOOKS_DATA_DIR, slug);
    const convexMirrorDir = path.join(CONVEX_ASSETS_DIR, slug);
    if (fs.existsSync(existingDir) || fs.existsSync(convexMirrorDir)) {
      excludedExisting += 1;
      continue;
    }

    const analysis = analysisBySlug.get(slug);
    if (analysis?.category === "FULL_PLAY") {
      excludedFull += 1;
      continue;
    }

    if (analysis?.category === "EMBEDDED_DRAMA") {
      if (!EMBEDDED_DRAMA_WHITELIST.includes(slug)) {
        excludedEmbedded += 1;
        continue;
      }
      includedEmbedded += 1;
    }

    items.push({ slug, status: "queued", attempts: 0, updatedAt: now });
  }

  const queue: QueueFile = {
    meta: {
      createdAt: now,
      updatedAt: now,
      total: items.length,
      embeddedWhitelist: [...EMBEDDED_DRAMA_WHITELIST],
      excluded: {
        fullPlay: excludedFull,
        embeddedDrama: excludedEmbedded,
        alreadyExists: excludedExisting,
      },
      includedEmbedded,
    },
    items,
  };

  writeQueue(queue);

  console.log(`Queue written to ${QUEUE_PATH}`);
  summarizeQueue(queue);
  console.log(`Excluded: full_play=${excludedFull}, embedded_drama=${excludedEmbedded}`);
  console.log(`Skipped (already exists): ${excludedExisting}`);
  console.log(`Included embedded drama (whitelist): ${includedEmbedded}`);
}

async function runQueue(limit?: number) {
  const queue = readQueue();
  let consecutiveFailures = 0;
  let processed = 0;

  for (const item of queue.items) {
    if (item.status === "done" || item.status === "skipped" || item.status === "failed") {
      continue;
    }

    if (limit !== undefined && processed >= limit) {
      console.log(`Reached limit ${limit}. Stopping.`);
      break;
    }

    const existingDir = path.join(BOOKS_DATA_DIR, item.slug);
    const convexMirrorDir = path.join(CONVEX_ASSETS_DIR, item.slug);
    if (fs.existsSync(existingDir) || fs.existsSync(convexMirrorDir)) {
      item.status = "skipped";
      item.updatedAt = new Date().toISOString();
      writeQueue(queue);
      console.log(`Skipped  (already exists in books-data or ConvexAssets).`);
      continue;
    }

    item.status = "running";
    item.attempts += 1;
    item.lastError = undefined;
    item.updatedAt = new Date().toISOString();
    writeQueue(queue);

    console.log(`\n=== Processing ${item.slug} ===`);

    try {
      await convertAndSaveSEBook(item.slug);
      const job = await startPipeline({ slug: item.slug });
      const result = await waitForJob(job);

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

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("standardebooks-queue")
    .command("build", "Build queue from standardebooks-data", {}, async () => {
      await buildQueue();
    })
    .command(
      "run",
      "Run queue (one book at a time)",
      (y) => y.option("limit", { type: "number", describe: "Max items to process" }),
      async (args) => {
        await runQueue(args.limit);
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
