// tools/scripts/deploy-s3-ink.tsx
import React, {useEffect, useMemo, useRef, useState} from "react";
import {render, Text, Box, useApp, useInput, useStdout} from "ink";
import { $, s3 } from "bun";
import PQueue from "p-queue";
import pRetry, {AbortError} from "p-retry";
import {readdir, stat} from "node:fs/promises";
import path from "node:path";

// ----------------------- config & flags -----------------------
const repoRoot = path.join(import.meta.dir, "../..");
const SOURCE_BOOKS_DIR =
  process.env.SOURCE_BOOKS_DIR ?? path.join(repoRoot, "apps/player/docker-build/books");
const BOOK_SUBDIR = process.env.BOOK_SUBDIR ?? ""; // e.g. "dist"
const BUILD_BOOK_CMD = process.env.BUILD_BOOK_CMD ?? "";
const MERGE_PROD_MANIFEST = /^(1|true|yes)$/i.test(process.env.MERGE_PROD_MANIFEST ?? "false");

const argv = new Map<string, string | true>();
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) argv.set(m[1], m[2] ?? true);
}
const FORCE =
  argv.has("force") || argv.has("f") ||
  /^(1|true|yes)$/i.test(process.env.FORCE ?? "");

const CONCURRENCY = Number(argv.get("concurrency") ?? process.env.CONCURRENCY ?? 12);
const RETRIES = Number(argv.get("retries") ?? process.env.RETRIES ?? 4);
const MIN_TIMEOUT_MS = Number(process.env.MIN_TIMEOUT_MS ?? 300);
const MAX_TIMEOUT_MS = Number(process.env.MAX_TIMEOUT_MS ?? 5000);
const BOOKS_FILTER = (argv.get("books") as string | undefined)?.split(",").map(s => s.trim()).filter(Boolean);

// ----------------------- helpers -----------------------
const toPosix = (p: string) => p.split(path.sep).join("/");
const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "-");

async function getBranchName(): Promise<string> {
  if (process.env.BRANCH_NAME) return process.env.BRANCH_NAME;
  const out = (await $`git rev-parse --abbrev-ref HEAD`.quiet().text()).trim();
  return out || "main";
}
async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, {withFileTypes: true});
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}
async function listAllBookSlugs(): Promise<string[]> {
  const entries = await readdir(SOURCE_BOOKS_DIR, {withFileTypes: true});
  return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
}
function fmtBytes(n: number) {
  const u = ["B","KB","MB","GB","TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}h ${m}m ${sec}s` : m ? `${m}m ${sec}s` : `${sec}s`;
}
function ProgressBar({value}: {value: number}) {
  const {stdout} = useStdout();
  const width = Math.max(10, Math.min((stdout?.columns ?? 80) - 20, 60));
  const clamped = Math.max(0, Math.min(1, value));
  const filled = Math.round(width * clamped);
  const empty = width - filled;
  return (
    <Text>
      [{"".padStart(filled, "█")}
      {"".padStart(empty, " ")}]
    </Text>
  );
}

// ----------------------- types -----------------------
type Job = { local: string; key: string; size: number; slug: string };

// ----------------------- App -----------------------
function App() {
  const {exit} = useApp();
  const [phase, setPhase] = useState<
    "init" | "detect" | "build" | "index" | "upload" | "manifest" | "done" | "error"
  >("init");
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<{
    branch: string; isProd: boolean; assetContext: string; buildVersion: string;
  } | null>(null);
  const [books, setBooks] = useState<string[]>([]);
  const [totals, setTotals] = useState<{files: number; bytes: number}>({files: 0, bytes: 0});
  const [progress, setProgress] = useState<{doneFiles: number; doneBytes: number; failed: number}>({
    doneFiles: 0, doneBytes: 0, failed: 0
  });
  const [log, setLog] = useState<string[]>([]);
  const startTimeRef = useRef<number>(Date.now());
  const [tick, setTick] = useState(0); // for ETA refresh

  // keys
  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      setLog(l => [`Aborting…`, ...l].slice(0, 200));
      exit();
    }
  });

  // periodic tick to keep ETA fresh
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setPhase("detect");
        const branch = await getBranchName();
        const isProd = branch === "main";
        const assetContext = isProd ? "production" : `staging/${branch}`;
        const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 15);
        const buildVersion = `v-${sanitize(branch)}-${stamp}`;
        setContext({branch, isProd, assetContext, buildVersion});

        // Determine target books
        let changed: string[] = [];
        if (!FORCE && !BOOKS_FILTER?.length) {
          const diff = await $`git diff --name-only main...HEAD apps/player/docker-build/books/`.quiet().text();
          changed = Array.from(new Set(
            diff.split("\n")
              .map(l => l.trim())
              .filter(Boolean)
              .map(toPosix)
              .map(p => p.match(/apps\/player\/docker-build\/books\/([^/]+)/)?.[1])
              .filter(Boolean) as string[]
          ));
        }
        // First-run smart fallback: no context manifest → force
        let hasContextManifest = true;
        try { await s3.file(`${assetContext}/versions.json`).text(); }
        catch { hasContextManifest = false; }

        let toDeploy: string[];
        if (BOOKS_FILTER?.length) {
          toDeploy = BOOKS_FILTER;
        } else if (FORCE || (changed.length === 0 && !hasContextManifest)) {
          if (!FORCE && !BOOKS_FILTER?.length) {
            setLog(l => [`No manifest found at ${assetContext}/versions.json → first run, forcing full upload.`, ...l]);
          }
          toDeploy = await listAllBookSlugs();
        } else {
          toDeploy = changed;
        }
        if (toDeploy.length === 0) {
          setLog(l => [`No changed books detected. Nothing to upload.`, ...l]);
          setPhase("done");
          return exit();
        }
        setBooks(toDeploy);

        // Optional build
        if (BUILD_BOOK_CMD) {
          setPhase("build");
          for (const slug of toDeploy) {
            setLog(l => [`🔨 Building ${slug}`, ...l].slice(0, 200));
            await $`${BUILD_BOOK_CMD} ${slug}`.quiet();
          }
        }

        // Index files
        setPhase("index");
        const jobs: Job[] = [];
        for (const slug of toDeploy) {
          const root = path.join(SOURCE_BOOKS_DIR, slug, BOOK_SUBDIR);
          for await (const file of walk(root)) {
            const rel = path.relative(root, file);
            const key = toPosix(`${assetContext}/assets/books/${slug}/${buildVersion}/${rel}`);
            const {size} = await stat(file);
            jobs.push({local: file, key, size, slug});
          }
        }
        const files = jobs.length;
        const bytes = jobs.reduce((a, j) => a + j.size, 0);
        setTotals({files, bytes});
        setLog(l => [`Uploading ${files} files (${fmtBytes(bytes)}) from ${toDeploy.length} book(s)…`, ...l].slice(0, 200));

        // Upload with queue
        setPhase("upload");
        startTimeRef.current = Date.now();

        const queue = new PQueue({concurrency: CONCURRENCY});
        let doneFiles = 0, doneBytes = 0, failed = 0;

        const uploadOne = async (j: Job) => {
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
              onFailedAttempt: (e) => {
                setLog(l => [`RETRY ${e.attemptNumber}/${RETRIES} ${j.key} – ${e.message}`, ...l].slice(0, 200));
              }
            }
          );
        };

        for (const j of jobs) {
          queue.add(async () => {
            try {
              await uploadOne(j);
            } catch (e: any) {
              failed++;
              setLog(l => [`FAIL ${j.local} -> ${j.key}: ${e?.message ?? e}`, ...l].slice(0, 200));
            } finally {
              doneFiles++;
              doneBytes += j.size;
              setProgress({doneFiles, doneBytes, failed});
            }
          });
        }

        await queue.onIdle();

        // Manifest
        setPhase("manifest");
        // Load base manifest if staging or if merging for prod
        let finalManifest: Record<string, string> = {};
        if (!isProd || MERGE_PROD_MANIFEST) {
          try {
            finalManifest = await s3.file("production/versions.json").json();
            setLog(l => [`Loaded production manifest as base.`, ...l].slice(0, 200));
          } catch {
            setLog(l => [`No production manifest found; starting fresh.`, ...l].slice(0, 200));
          }
        }
        for (const slug of toDeploy) finalManifest[slug] = buildVersion;
        const manifestKey = `${assetContext}/versions.json`;
        await s3.write(manifestKey, JSON.stringify(finalManifest, null, 2));
        setLog(l => [`✅ Manifest updated at ${manifestKey}`, ...l].slice(0, 200));

        setPhase("done");
        // small delay so user sees final state
        setTimeout(() => exit(), 250);
      } catch (e: any) {
        setError(e?.message ?? String(e));
        setPhase("error");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elapsed = (Date.now() - startTimeRef.current) / 1000;
  const rate = progress.doneBytes / Math.max(elapsed, 0.001);
  const remain = Math.max(0, totals.bytes - progress.doneBytes);
  const eta = rate > 0 ? remain / rate : Infinity;
  const pct = totals.bytes ? progress.doneBytes / totals.bytes : 0;

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>🚀 S3 Deployment</Text>
      </Box>

      {context && (
        <Box flexDirection="column" marginBottom={1}>
          <Text>context: <Text color="cyan">{context.assetContext}</Text></Text>
          <Text>build:   <Text color="cyan">{context.buildVersion}</Text></Text>
          <Text>branch:  {context.branch}   prod: {String(context.isProd)}   force: {String(FORCE)}</Text>
          <Text>opts:    concurrency={CONCURRENCY} retries={RETRIES}</Text>
          {books.length > 0 && <Text>books:   {books.join(", ")}</Text>}
        </Box>
      )}

      {phase === "upload" || phase === "manifest" || phase === "done" ? (
        <Box flexDirection="column" marginBottom={1}>
          <ProgressBar value={pct} />
          <Text>
            {`${(pct * 100).toFixed(1).padStart(5)}%  `}
            {`${progress.doneFiles}/${totals.files}  `}
            {`${fmtBytes(progress.doneBytes)}/${fmtBytes(totals.bytes)}  `}
            {`@ ${fmtBytes(rate)}/s  ETA ${fmtTime(eta)}  `}
            {progress.failed ? `fail:${progress.failed}` : ``}
          </Text>
        </Box>
      ) : null}

      <Box marginBottom={1}>
        <Text>
          {phase === "init" && "Initializing…"}
          {phase === "detect" && "Detecting changed books…"}
          {phase === "build" && "Building selected books…"}
          {phase === "index" && "Indexing files…"}
          {phase === "upload" && "Uploading… (press 'q' to quit)"}
          {phase === "manifest" && "Updating manifest…"}
          {phase === "done" && "Done."}
          {phase === "error" && <Text color="red">Error: {error}</Text>}
        </Text>
      </Box>

      <Box flexDirection="column">
        {log.slice(0, 8).map((line, i) => (
          <Text key={i} color={/^(FAIL|RETRY)/.test(line) ? "yellow" : undefined}>
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

// ----------------------- bootstrap -----------------------
render(<App />);