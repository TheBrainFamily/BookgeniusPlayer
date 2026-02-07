#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { resolveBookDir } from "../helpers/resolveBookDir";

interface ManifestRow {
  provider: "gemini" | "vertex" | "gpt-5" | "grok";
  phase: "primary" | "fallback";
  status: "success" | "failure";
  errorClass?: "retryable_infra" | "non_retryable_provider" | "validation_failure";
  chapter: number;
  chunkIndex?: number;
  attemptNumber: number;
  selectedAsFinal?: boolean;
  artifactPaths: { raw?: string; restored?: string; diffVsSelected?: string };
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getBenchmarkRoot(): string {
  return path.join(resolveBookDir(), "temporary-output", "rewrite-benchmarks");
}

function getTargetRunDir(root: string, requestedRunId?: string): string {
  if (requestedRunId) {
    return path.join(root, requestedRunId);
  }

  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (entries.length === 0) {
    throw new Error(`No benchmark runs found in ${root}`);
  }

  return path.join(root, entries[entries.length - 1]);
}

function parseManifest(filePath: string): ManifestRow[] {
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => JSON.parse(line) as ManifestRow);
}

function main() {
  const runId = process.argv[2];
  const root = getBenchmarkRoot();

  if (!fs.existsSync(root)) {
    throw new Error(`Benchmark directory does not exist: ${root}`);
  }

  const runDir = getTargetRunDir(root, runId);
  const selectedRunId = path.basename(runDir);

  const summaryPath = path.join(runDir, "summary.json");
  const manifestPath = path.join(runDir, "manifest.ndjson");

  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Missing summary: ${summaryPath}`);
  }

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing manifest: ${manifestPath}`);
  }

  const summary = readJson(summaryPath) as {
    runId: string;
    totalAttempts: number;
    fallbackUsedCount: number;
    attemptsByProvider: Record<string, number>;
    successByProvider: Record<string, number>;
    failuresByErrorClass: Record<string, number>;
    finalWinnerCount: Record<string, number>;
    grokSelectedDueToGptFailure: number;
  };

  const rows = parseManifest(manifestPath);

  const phaseCounts = rows.reduce(
    (acc, row) => {
      acc[row.phase] += 1;
      return acc;
    },
    { primary: 0, fallback: 0 },
  );

  const providerFailures = rows.reduce<Record<string, number>>((acc, row) => {
    if (row.status === "failure") {
      const key = `${row.provider}:${row.errorClass || "unknown"}`;
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, {});

  const diffFiles = rows
    .map((row) => row.artifactPaths.diffVsSelected)
    .filter((filePath): filePath is string => Boolean(filePath));

  console.log("=".repeat(70));
  console.log(`REWRITE BENCHMARK REPORT (${selectedRunId})`);
  console.log("=".repeat(70));
  console.log(`Run ID: ${summary.runId}`);
  console.log(`Total attempts: ${summary.totalAttempts}`);
  console.log(`Primary attempts: ${phaseCounts.primary}`);
  console.log(`Fallback attempts: ${phaseCounts.fallback}`);
  console.log(`Fallback invocations: ${summary.fallbackUsedCount}`);
  console.log(`Grok selected due to GPT-5 failure: ${summary.grokSelectedDueToGptFailure}`);
  console.log("-");
  console.log("Attempts by provider:");
  for (const [provider, count] of Object.entries(summary.attemptsByProvider)) {
    console.log(`  ${provider}: ${count}`);
  }
  console.log("-");
  console.log("Success by provider:");
  for (const [provider, count] of Object.entries(summary.successByProvider)) {
    console.log(`  ${provider}: ${count}`);
  }
  console.log("-");
  console.log("Failure classes:");
  for (const [errorClass, count] of Object.entries(summary.failuresByErrorClass)) {
    console.log(`  ${errorClass}: ${count}`);
  }
  console.log("-");
  console.log("Winner distribution:");
  for (const [provider, count] of Object.entries(summary.finalWinnerCount)) {
    console.log(`  ${provider}: ${count}`);
  }
  console.log("-");
  console.log("Top provider/error combinations:");
  const sortedFailures = Object.entries(providerFailures).sort((a, b) => b[1] - a[1]);
  for (const [key, count] of sortedFailures.slice(0, 10)) {
    console.log(`  ${key}: ${count}`);
  }

  console.log("-");
  console.log(`Diff files count: ${diffFiles.length}`);
  if (diffFiles.length > 0) {
    console.log("Diff file samples:");
    for (const diffFile of diffFiles.slice(0, 10)) {
      console.log(`  ${diffFile}`);
    }
  }

  console.log("-");
  console.log(`Summary path: ${summaryPath}`);
  console.log(`Manifest path: ${manifestPath}`);
}

main();
