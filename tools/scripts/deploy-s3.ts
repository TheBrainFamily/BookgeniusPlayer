// tools/scripts/deploy-s3.ts
import { $, s3 } from "bun";
import PQueue from "p-queue";
import pRetry, { AbortError } from "p-retry";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

// ---------- config ----------
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 12);
const RETRIES = Number(process.env.RETRIES ?? 4);
const MIN_TIMEOUT_MS = Number(process.env.MIN_TIMEOUT_MS ?? 300);
const MAX_TIMEOUT_MS = Number(process.env.MAX_TIMEOUT_MS ?? 5000);

const repoRoot = path.join(import.meta.dir, "../..");
const SOURCE_BOOKS_DIR = process.env.SOURCE_BOOKS_DIR ?? path.join(repoRoot, "build/s3-data/assets/books");
const BOOK_SUBDIR = process.env.BOOK_SUBDIR ?? "";
const BUILD_BOOK_CMD = process.env.BUILD_BOOK_CMD ?? "";
const MERGE_PROD_MANIFEST = (process.env.MERGE_PROD_MANIFEST ?? "false") === "true";

// --- flags/env ---
const argv = new Set(process.argv.slice(2));
const FORCE = argv.has("--force") || argv.has("-f") || /^(1|true|yes)$/i.test(process.env.FORCE ?? "");

// ---------- helpers ----------
const toPosix = (p: string) => p.split(path.sep).join("/");
const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "-");

async function getBranchName(): Promise<string> {
  if (process.env.BRANCH_NAME) return process.env.BRANCH_NAME;
  throw new Error("BRANCH_NAME variable not set up.")
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function listAllBookSlugs(): Promise<string[]> {
  const entries = await readdir(SOURCE_BOOKS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function fmtBytes(n: number) {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}h ${m}m ${sec}s` : m ? `${m}m ${sec}s` : `${sec}s`;
}

// ---------- main ----------
const branchName = await getBranchName();
const isProduction = branchName === "main";
const assetContext = process.env.ASSET_CONTEXT

const stamp = new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, "")
  .slice(0, 15);
const buildVersion = `v-${sanitize(branchName)}-${stamp}`;

console.log(`🚀 Starting S3 deployment for context: ${assetContext}`);
console.log(`   concurrency=${CONCURRENCY} retries=${RETRIES}`);
console.log(`   SOURCE_BOOKS_DIR=${SOURCE_BOOKS_DIR} BOOK_SUBDIR=${BOOK_SUBDIR || "(none)"}`);
console.log(`   buildVersion=${buildVersion} force=${FORCE}`);

// --- 1) Detect changed books OR force ---
let changedBooks: string[] = [];

if (!FORCE) {
  const diff = await $`git diff --name-only main...HEAD apps/player/docker-build/books/`.quiet().text();
  changedBooks = Array.from(
    new Set(
      diff
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map(toPosix)
        .map((p) => p.match(/apps\/player\/docker-build\/books\/([^/]+)/)?.[1])
        .filter(Boolean) as string[],
    ),
  );
}

// First-run smart fallback: if nothing changed & no manifest at target context → force all
let hasContextManifest = true;
try {
  await s3.file(`${assetContext}/versions.json`).text();
} catch {
  hasContextManifest = false;
}
if (FORCE || (changedBooks.length === 0 && !hasContextManifest)) {
  if (!FORCE) console.log("ℹ️  No context manifest found; treating as first run → forcing full upload.");
  changedBooks = await listAllBookSlugs();
}

if (changedBooks.length === 0) {
  console.log("📚 No changed books detected. Nothing to upload.");
  process.exit(0);
}
console.log("📚 Books to deploy:", changedBooks);

// --- 2) Load base manifest if needed ---
let finalManifest: Record<string, string> = {};
if (!isProduction || MERGE_PROD_MANIFEST) {
  try {
    finalManifest = await s3.file("production/versions.json").json();
    console.log("📋 Loaded production manifest as base.");
  } catch {
    console.warn("⚠️  Could not load production manifest. Starting fresh.");
  }
}

// --- 3) Optional build (sequential) ---
if (BUILD_BOOK_CMD) {
  for (const slug of changedBooks) {
    console.log(`— 🔨 Building book: ${slug}`);
    await $`${BUILD_BOOK_CMD} ${slug}`.quiet();
  }
}

// --- 4) Index ALL files across selected books up front ---
type Job = { local: string; key: string; size: number; slug: string };
const jobs: Job[] = [];
for (const slug of changedBooks) {
  const localRoot = path.join(SOURCE_BOOKS_DIR, slug, BOOK_SUBDIR);
  for await (const filePath of walk(localRoot)) {
    const rel = path.relative(localRoot, filePath);
    const relStripped = rel.replace(/^\/?v\d{8}T\d{6}(?:\/|$)/, "");
    const key = toPosix(`${assetContext}/assets/books/${slug}/${buildVersion}/${relStripped}`);
    const { size } = await stat(filePath);
    jobs.push({ local: filePath, key, size, slug });
  }
}

// Totals for progress/ETA
const totalFiles = jobs.length;
const totalBytes = jobs.reduce((a, j) => a + j.size, 0);
console.log(`📦 Uploading ${totalFiles} files (${fmtBytes(totalBytes)}) from ${changedBooks.length} book(s).`);

// --- 5) Enqueue ALL uploads (global), no per-book waiting ---
const queue = new PQueue({ concurrency: CONCURRENCY });
let completedFiles = 0;
let uploadedBytes = 0;
let failed = 0;

const start = Date.now();
const render = () => {
  const elapsed = (Date.now() - start) / 1000;
  const rate = uploadedBytes / Math.max(elapsed, 0.001); // bytes/s
  const remain = totalBytes - uploadedBytes;
  const eta = rate > 0 ? remain / rate : Infinity;
  const pct = totalBytes ? Math.min(100, (uploadedBytes / totalBytes) * 100) : 0;
  const line =
    `${pct.toFixed(1).padStart(5)}%  ` +
    `${completedFiles}/${totalFiles}  ` +
    `${fmtBytes(uploadedBytes)}/${fmtBytes(totalBytes)}  ` +
    `@ ${fmtBytes(rate)}/s  ETA ${fmtTime(eta)}  ` +
    (failed ? `fail:${failed}` : "");
  process.stdout.write(`\r${line}`);
};
const tick = setInterval(render, 1000);

// schedule jobs
for (const j of jobs) {
  queue
    .add(async () => {
      await pRetry(
        async () => {
          try {
            const file = Bun.file(j.local);
            await s3.write(j.key, file);
          } catch (err: any) {
            const status = err?.status ?? err?.response?.status;
            if (status && status >= 400 && status < 500 && status !== 429) {
              throw new AbortError(err);
            }
            throw err;
          }
        },
        {
          retries: RETRIES,
          factor: 2,
          randomize: true,
          minTimeout: MIN_TIMEOUT_MS,
          maxTimeout: MAX_TIMEOUT_MS,
          onFailedAttempt: (e) => console.warn(`\n[RETRY ${e.attemptNumber}/${RETRIES}] ${j.key} – ${e.message}`),
        },
      );
      completedFiles++;
      uploadedBytes += j.size;
    })
    .catch((e) => {
      failed++;
      completedFiles++;
      console.error(`\n[FAIL] ${j.local} -> ${j.key}:`, e?.message ?? e);
    });
}

await queue.onIdle();
clearInterval(tick);
render();
process.stdout.write("\n");

console.log(`\n⏫ Uploads done. ok=${completedFiles - failed} fail=${failed} total=${totalFiles}`);

// --- 6) Update manifest only for the deployed books ---
for (const slug of changedBooks) {
  finalManifest[slug] = buildVersion;
}
const manifestKey = `${assetContext}/versions.json`;
await s3.write(manifestKey, JSON.stringify(finalManifest, null, 2));
console.log(`✅ Final manifest uploaded to: ${manifestKey}`);
