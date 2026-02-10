import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { ReviewChunk } from "./types";

interface HunkSeed {
  filePath: string;
  hunkIndex: number;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  patchLines: string[];
}

export interface ParsedDiff {
  chunks: ReviewChunk[];
  changedFiles: string[];
}

function runGitCommand(workspaceRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function normalizeGitOutput(value: string): string {
  return value.replace(/\r\n/g, "\n").trimEnd();
}

function shouldIgnoreReviewArtifactPath(filePath: string): boolean {
  return (
    filePath === ".codex-review" ||
    filePath === ".tours" ||
    filePath.startsWith(".codex-review/") ||
    filePath.startsWith(".tours/")
  );
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPreviewText(lines: string[]): string {
  const changed = lines
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .filter((line) => !line.startsWith("+++ ") && !line.startsWith("--- "))
    .map((line) => line.slice(1).trim())
    .filter((line) => line.length > 0)
    .slice(0, 2);

  if (changed.length === 0) {
    return "No textual preview";
  }
  return changed.join(" | ").slice(0, 160);
}

function toChunkId(seed: HunkSeed): string {
  const base = [
    seed.filePath,
    seed.hunkIndex.toString(),
    seed.oldStart.toString(),
    seed.newStart.toString(),
    seed.patchLines.join("\n"),
  ].join("|");
  return `chunk-${createHash("sha1").update(base).digest("hex").slice(0, 12)}`;
}

function inferExplanation(seed: HunkSeed): string {
  const plusCount = seed.patchLines.filter(
    (line) => line.startsWith("+") && !line.startsWith("+++ "),
  ).length;
  const minusCount = seed.patchLines.filter(
    (line) => line.startsWith("-") && !line.startsWith("--- "),
  ).length;
  return `Changes ${plusCount} added and ${minusCount} removed lines in this chunk.`;
}

function inferReasoning(filePath: string): string {
  return `Part of the working tree update for ${filePath}.`;
}

export function deriveArea(filePath: string): string {
  const parts = filePath.split("/").filter((part) => part.length > 0);
  if (parts.length === 0) {
    return "root";
  }
  if (parts[0] === "apps" && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

function toChunkFromSeed(seed: HunkSeed): ReviewChunk {
  return {
    id: toChunkId(seed),
    filePath: seed.filePath,
    hunkIndex: seed.hunkIndex,
    oldStart: seed.oldStart,
    oldLines: seed.oldLines,
    newStart: seed.newStart,
    newLines: seed.newLines,
    patch: seed.patchLines.join("\n"),
    preview: toPreviewText(seed.patchLines),
    explanation: inferExplanation(seed),
    reasoning: inferReasoning(seed.filePath),
  };
}

export function isInsideGitRepo(workspaceRoot: string): boolean {
  try {
    runGitCommand(workspaceRoot, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

export function getWorkingTreePatch(workspaceRoot: string, baseRef = "HEAD"): string {
  return runGitCommand(workspaceRoot, [
    "diff",
    "--no-color",
    "--unified=0",
    "--no-ext-diff",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    baseRef,
    "--",
  ]);
}

export function getUntrackedFiles(workspaceRoot: string): string[] {
  const raw = runGitCommand(workspaceRoot, ["ls-files", "--others", "--exclude-standard"]);
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseDiffHeaderFile(line: string): string | undefined {
  const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
  if (!match) {
    return undefined;
  }
  return match[2];
}

function parseHunkHeader(
  line: string,
): Omit<HunkSeed, "filePath" | "hunkIndex" | "patchLines"> | undefined {
  const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) {
    return undefined;
  }
  return {
    oldStart: toPositiveInt(match[1], 1),
    oldLines: toPositiveInt(match[2], 1),
    newStart: toPositiveInt(match[3], 1),
    newLines: toPositiveInt(match[4], 1),
  };
}

function createHunkSeed(
  filePath: string,
  hunkIndex: number,
  header: string,
  bodyLines: string[],
): HunkSeed | undefined {
  const parsed = parseHunkHeader(header);
  if (!parsed) {
    return undefined;
  }
  return {
    filePath,
    hunkIndex,
    oldStart: parsed.oldStart,
    oldLines: parsed.oldLines,
    newStart: parsed.newStart,
    newLines: parsed.newLines,
    patchLines: [header, ...bodyLines],
  };
}

export function parsePatchToChunks(patch: string): ParsedDiff {
  const lines = patch.split(/\r?\n/);
  const chunks: ReviewChunk[] = [];
  const changedFiles = new Set<string>();
  let currentFile: string | undefined;
  const fileHunkCounts = new Map<string, number>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fileFromHeader = parseDiffHeaderFile(line);
    if (fileFromHeader) {
      currentFile = fileFromHeader;
      changedFiles.add(fileFromHeader);
      continue;
    }

    if (!line.startsWith("@@") || !currentFile) {
      continue;
    }

    const body: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const next = lines[cursor];
      if (next.startsWith("diff --git ") || next.startsWith("@@")) {
        break;
      }
      body.push(next);
      cursor += 1;
    }

    const hunkIndex = (fileHunkCounts.get(currentFile) ?? 0) + 1;
    fileHunkCounts.set(currentFile, hunkIndex);
    const seed = createHunkSeed(currentFile, hunkIndex, line, body);
    if (seed) {
      chunks.push(toChunkFromSeed(seed));
    }
    index = cursor - 1;
  }

  return { chunks, changedFiles: Array.from(changedFiles).sort() };
}

function isLikelyBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function toUntrackedChunk(workspaceRoot: string, filePath: string): ReviewChunk | undefined {
  const absolute = path.join(workspaceRoot, filePath);
  const raw = readFileSync(absolute);
  if (isLikelyBinary(raw)) {
    return undefined;
  }

  const text = raw.toString("utf8");
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.find((line) => line.trim().length > 0) ?? "New file content";
  const lineCount = lines.length > 0 && lines.at(-1) === "" ? lines.length - 1 : lines.length;
  const previewLines = lines.slice(0, 12).map((line) => `+${line}`);
  const patchLines = [`@@ -0,0 +1,${Math.max(lineCount, 1)} @@`, ...previewLines];

  return {
    id: `chunk-${createHash("sha1").update(`untracked:${filePath}`).digest("hex").slice(0, 12)}`,
    filePath,
    hunkIndex: 1,
    oldStart: 0,
    oldLines: 0,
    newStart: 1,
    newLines: Math.max(lineCount, 1),
    patch: patchLines.join("\n"),
    preview: nonEmpty.slice(0, 160),
    explanation: "Adds a new untracked file.",
    reasoning: `File is currently untracked and included for review: ${filePath}.`,
  };
}

export function createUntrackedChunks(workspaceRoot: string): ReviewChunk[] {
  return getUntrackedFiles(workspaceRoot)
    .map((filePath) => toUntrackedChunk(workspaceRoot, filePath))
    .filter((chunk): chunk is ReviewChunk => Boolean(chunk));
}

export function computeChunksFingerprint(chunks: ReviewChunk[]): string {
  const base = chunks
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((chunk) => `${chunk.filePath}|${chunk.oldStart}|${chunk.newStart}|${chunk.patch}`)
    .join("\n---\n");

  return createHash("sha256").update(base).digest("hex");
}

export function getWorkspaceStatusFingerprint(workspaceRoot: string): string {
  const head = normalizeGitOutput(runGitCommand(workspaceRoot, ["rev-parse", "HEAD"]));
  const patch = getWorkingTreePatch(workspaceRoot, "HEAD");
  const trackedChunks = parsePatchToChunks(patch).chunks.filter(
    (chunk) => !shouldIgnoreReviewArtifactPath(chunk.filePath),
  );
  const untrackedChunks = createUntrackedChunks(workspaceRoot).filter(
    (chunk) => !shouldIgnoreReviewArtifactPath(chunk.filePath),
  );
  const chunkFingerprint = computeChunksFingerprint([...trackedChunks, ...untrackedChunks]);
  return createHash("sha256").update(`${head}\n${chunkFingerprint}`).digest("hex");
}
