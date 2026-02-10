import {
  computeChunksFingerprint,
  createUntrackedChunks,
  deriveArea,
  getWorkingTreePatch,
  isInsideGitRepo,
  parsePatchToChunks,
} from "./git";
import { applyAiStoryToPlan } from "./story-ai";
import type { AiStoryOutput } from "./story-ai";
import type { AuthorNotes, ReviewChunk, ReviewPlan, ReviewStep } from "./types";

export interface BuildReviewPlanOptions {
  workspaceRoot: string;
  baseRef?: string;
  notes?: AuthorNotes;
  story?: AiStoryOutput;
  includeFiles?: string[];
  includePaths?: string[];
}

function toSessionId(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

function toUnique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function toChunkMap(chunks: ReviewChunk[]): Map<string, ReviewChunk> {
  return new Map(chunks.map((chunk) => [chunk.id, chunk]));
}

function toMidSteps(chunks: ReviewChunk[]): ReviewStep[] {
  const byArea = new Map<string, ReviewChunk[]>();
  for (const chunk of chunks) {
    const area = deriveArea(chunk.filePath);
    const existing = byArea.get(area) ?? [];
    existing.push(chunk);
    byArea.set(area, existing);
  }

  return Array.from(byArea.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([area, areaChunks], index) => ({
      id: `step-mid-${index + 1}`,
      level: "mid",
      title: `${area}: changed files`,
      why: "Review this area before diving into chunk-level details.",
      files: toUnique(areaChunks.map((chunk) => chunk.filePath)).sort(),
      chunkIds: areaChunks.map((chunk) => chunk.id),
    }));
}

function toLowSteps(chunks: ReviewChunk[]): ReviewStep[] {
  return chunks.map((chunk, index) => ({
    id: `step-low-${index + 1}`,
    level: "low",
    title: `${chunk.filePath}:${chunk.newStart || chunk.oldStart}`,
    why: "Inspect this concrete implementation chunk in context.",
    files: [chunk.filePath],
    chunkIds: [chunk.id],
  }));
}

function applyNotesToChunks(chunks: ReviewChunk[], notes: AuthorNotes | undefined): ReviewChunk[] {
  if (!notes?.chunkOverrides) {
    return chunks;
  }
  return chunks.map((chunk) => {
    const override = notes.chunkOverrides?.[chunk.id];
    if (!override) {
      return chunk;
    }
    return {
      ...chunk,
      explanation: override.explanation ?? chunk.explanation,
      reasoning: override.reasoning ?? chunk.reasoning,
    };
  });
}

function applyNotesToSteps(steps: ReviewStep[], notes: AuthorNotes | undefined): ReviewStep[] {
  if (!notes?.stepOverrides) {
    return steps;
  }

  return steps.map((step) => {
    const override = notes.stepOverrides?.[step.id];
    if (!override) {
      return step;
    }
    return { ...step, title: override.title ?? step.title, why: override.why ?? step.why };
  });
}

function toSortedChunks(chunks: ReviewChunk[]): ReviewChunk[] {
  return chunks.slice().sort((left, right) => {
    const fileCompare = left.filePath.localeCompare(right.filePath);
    if (fileCompare !== 0) {
      return fileCompare;
    }
    if (left.newStart !== right.newStart) {
      return left.newStart - right.newStart;
    }
    return left.oldStart - right.oldStart;
  });
}

function normalizeRepoPath(filePath: string): string {
  const slashes = filePath.replaceAll("\\", "/");
  const withoutDot = slashes.replace(/^\.\/+/, "");
  return withoutDot.replace(/^\/+/, "").replace(/\/+$/, "");
}

function toNormalizedList(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .map((value) => normalizeRepoPath(value)),
    ),
  );
}

function fileMatchesPathPrefix(filePath: string, prefix: string): boolean {
  return filePath === prefix || filePath.startsWith(`${prefix}/`);
}

function filterChunksByScope(
  chunks: ReviewChunk[],
  options: BuildReviewPlanOptions,
): ReviewChunk[] {
  const includeFiles = toNormalizedList(options.includeFiles);
  const includePaths = toNormalizedList(options.includePaths);
  const hasScopeFilters = includeFiles.length > 0 || includePaths.length > 0;
  if (!hasScopeFilters) {
    return chunks;
  }

  const includeFileSet = new Set(includeFiles);
  return chunks.filter((chunk) => {
    const normalizedPath = normalizeRepoPath(chunk.filePath);
    if (includeFileSet.has(normalizedPath)) {
      return true;
    }
    return includePaths.some((prefix) => fileMatchesPathPrefix(normalizedPath, prefix));
  });
}

function scopeDescription(options: BuildReviewPlanOptions): string {
  const includeFiles = toNormalizedList(options.includeFiles);
  const includePaths = toNormalizedList(options.includePaths);
  const segments: string[] = [];
  if (includeFiles.length > 0) {
    segments.push(`includeFiles=${includeFiles.join(",")}`);
  }
  if (includePaths.length > 0) {
    segments.push(`includePaths=${includePaths.join(",")}`);
  }
  return segments.length > 0 ? ` (${segments.join(" | ")})` : "";
}

export function buildReviewPlan(options: BuildReviewPlanOptions): ReviewPlan {
  const baseRef = options.baseRef ?? "HEAD";
  if (!isInsideGitRepo(options.workspaceRoot)) {
    throw new Error(`Not inside a git repository: ${options.workspaceRoot}`);
  }

  const patch = getWorkingTreePatch(options.workspaceRoot, baseRef);
  const parsed = parsePatchToChunks(patch);
  const withUntracked = [...parsed.chunks, ...createUntrackedChunks(options.workspaceRoot)];
  const scopedChunks = filterChunksByScope(withUntracked, options);
  const chunks = applyNotesToChunks(toSortedChunks(scopedChunks), options.notes);
  if (chunks.length === 0) {
    throw new Error(
      `No working tree chunks found for current scope${scopeDescription(options)}. Make changes or adjust include filters.`,
    );
  }

  const chunkMap = toChunkMap(chunks);
  const areas = toUnique(chunks.map((chunk) => deriveArea(chunk.filePath))).sort();
  const allFiles = toUnique(chunks.map((chunk) => chunk.filePath)).sort();
  const highStep: ReviewStep = {
    id: "step-high-1",
    level: "high",
    title: "High-level overview",
    why: "Start from intent and scope before reviewing implementation details.",
    files: allFiles,
    chunkIds: chunks.map((chunk) => chunk.id),
  };

  const steps = applyNotesToSteps(
    [highStep, ...toMidSteps(chunks), ...toLowSteps(chunks)],
    options.notes,
  );
  const summaryIntent =
    options.notes?.summary?.intent ??
    `Working tree update touching ${chunks.length} chunks in ${areas.length} area(s).`;

  // Ensure every step references known chunk ids.
  for (const step of steps) {
    step.chunkIds = step.chunkIds.filter((chunkId) => chunkMap.has(chunkId));
  }

  return {
    version: 1,
    sessionId: toSessionId(new Date()),
    baseRef,
    source: "working_tree",
    createdAt: new Date().toISOString(),
    diffHash: computeChunksFingerprint(chunks),
    summary: {
      intent: summaryIntent,
      areas: options.notes?.summary?.areas?.length ? options.notes.summary.areas : areas,
    },
    steps,
    chunks,
  };
}

export function buildReviewPlanWithStory(options: BuildReviewPlanOptions): ReviewPlan {
  const heuristicPlan = buildReviewPlan(options);
  if (!options.story) {
    return heuristicPlan;
  }
  return applyAiStoryToPlan(heuristicPlan, options.story);
}
